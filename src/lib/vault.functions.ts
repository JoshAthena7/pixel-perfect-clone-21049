// Per-mission Vault: client reference documents (DSR, contract, SOW, style guide, other).
// M4: every uploaded file is validated server-side — mime allowlist, size cap,
// magic bytes, and PHI scan on extracted text — before the row is created.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validateVaultMime,
  validateVaultSize,
  validateVaultMagicBytes,
  extractTextForPHIScan,
  VAULT_MAX_BYTES,
} from "./file-validation";
import { assertNoPHI } from "./phi-detection";

// Vault mutations (upload / delete) are admin-only — all setup lives in the
// Olympus / Admin control room. Mission members can still view + download.
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      JSON.stringify({
        error: "forbidden",
        message: "Only platform admins can modify the Vault. Ask an admin to add or remove documents from the Olympus control room.",
      }),
    );
  }
}

export const VAULT_DOC_TYPES = [
  "data_security",
  "contract",
  "scope_of_work",
  "style_guide",
  "outline_template",
  "dpa",
  "other",
] as const;
export type VaultDocType = (typeof VAULT_DOC_TYPES)[number];

export const VAULT_TYPE_META: Record<
  VaultDocType,
  { label: string; short: string; description: string; required: boolean }
> = {
  data_security: {
    label: "Data Security Requirements",
    short: "DSR",
    description: "Client-supplied data handling, classification, and security rules.",
    required: true,
  },
  contract: {
    label: "Contract",
    short: "Contract",
    description: "Executed prime/sub contract or teaming agreement.",
    required: true,
  },
  scope_of_work: {
    label: "Scope of Work",
    short: "SOW",
    description: "Statement / scope of work and deliverables.",
    required: true,
  },
  style_guide: {
    label: "Style Guide",
    short: "Style",
    description: "Client voice, formatting, and terminology guide.",
    required: true,
  },
  outline_template: {
    label: "Outline Template",
    short: "Outline",
    description: "Approved response outline — sections, order, length limits.",
    required: true,
  },
  dpa: {
    label: "Data Processing Agreement",
    short: "DPA",
    description: "Executed Atlas DPA — ephemeral processing & no-training commitment.",
    required: true,
  },
  other: {
    label: "Other Reference",
    short: "Other",
    description: "Additional client-provided reference material.",
    required: false,
  },
};

export type VaultDoc = {
  id: string;
  mission_id: string;
  doc_type: VaultDocType;
  title: string;
  description: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  version: string | null;
  external_url: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// ─── List ──────────────────────────────────────────────────────────────────
export const listVaultDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: rows, error } = await supabase
      .from("mission_vault_documents")
      .select("*")
      .eq("mission_id", data.missionId)
      .order("doc_type", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as VaultDoc[];
  });

// ─── Create ────────────────────────────────────────────────────────────────
const CreateInput = z.object({
  missionId: z.string().uuid(),
  docType: z.enum(VAULT_DOC_TYPES),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  filePath: z.string().trim().max(500).nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  mimeType: z.string().trim().max(120).nullable().optional(),
  version: z.string().trim().max(40).nullable().optional(),
  externalUrl: z.string().url().max(500).nullable().optional(),
});

export const createVaultDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertAdmin(supabase, userId);

    if (!data.filePath && !data.externalUrl) {
      throw new Error("Either a file upload or an external link is required.");
    }

    // ─── M4: server-side file validation (uploads only) ────────────────
    if (data.filePath) {
      // 1. mime allowlist + extension match
      if (!data.mimeType) {
        throw new Error(JSON.stringify({ error: "unsupported_file_type", message: "MIME type required for uploads." }));
      }
      const mimeErr = validateVaultMime(data.title, data.mimeType);
      if (mimeErr) throw new Error(JSON.stringify(mimeErr));

      // 2. size cap (trust the declared size as a fast-path reject, then
      //    re-check the actual bytes below)
      if (typeof data.fileSize === "number") {
        const sizeErr = validateVaultSize(data.fileSize);
        if (sizeErr) throw new Error(JSON.stringify(sizeErr));
      }

      // 3. download the bytes once for magic-bytes + PHI scan
      const { data: blob, error: dlErr } = await supabase.storage
        .from("mission-library")
        .download(data.filePath);
      if (dlErr || !blob) throw new Error("Uploaded file could not be read for validation.");
      const arrayBuf = await blob.arrayBuffer();
      const buf = new Uint8Array(arrayBuf);

      // Actual-size re-check
      const sizeErr = validateVaultSize(buf.byteLength);
      if (sizeErr) {
        await supabase.storage.from("mission-library").remove([data.filePath]);
        throw new Error(JSON.stringify(sizeErr));
      }

      // 4. magic bytes vs declared MIME
      const magicErr = validateVaultMagicBytes(buf, data.mimeType);
      if (magicErr) {
        await supabase.storage.from("mission-library").remove([data.filePath]);
        throw new Error(JSON.stringify(magicErr));
      }

      // 5. PHI scan on extracted text. Fail-closed: rejection deletes the
      //    uploaded blob and throws the standard PHI error payload so the UI
      //    can render the non-dismissible warning.
      const text = extractTextForPHIScan(buf, data.mimeType);
      if (text && text.length > 0) {
        try {
          await assertNoPHI({
            text,
            surface: "vault_upload",
            actorUserId: userId,
          });
        } catch (e) {
          // Best-effort cleanup of the rejected upload
          await supabase.storage.from("mission-library").remove([data.filePath]).catch(() => {});
          throw e;
        }
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const uploaderName =
      profile?.display_name || profile?.full_name || profile?.email || null;

    const { data: row, error } = await supabase
      .from("mission_vault_documents")
      .insert({
        mission_id: data.missionId,
        doc_type: data.docType,
        title: data.title,
        description: data.description ?? null,
        file_path: data.filePath ?? null,
        file_size: data.fileSize ?? null,
        mime_type: data.mimeType ?? null,
        version: data.version ?? null,
        external_url: data.externalUrl ?? null,
        uploaded_by: userId,
        uploaded_by_name: uploaderName,
        extraction_status: data.filePath ? "pending" : "no_file",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Fire-and-forget: extract text + embed for IRIS retrieval.
    // Failures are recorded on the row itself; never block the upload.
    if (data.filePath) {
      try {
        const { extractAndEmbedVaultDoc } = await import("./vault-extract.server");
        await extractAndEmbedVaultDoc(supabase, row.id);
      } catch {
        /* swallowed — status row already records the failure */
      }
    }

    return row as VaultDoc;
  });

// ─── Manual re-extract (retry / Olympus admin) ─────────────────────────────
export const extractVaultDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertAdmin(supabase, userId);
    const { extractAndEmbedVaultDoc } = await import("./vault-extract.server");
    return await extractAndEmbedVaultDoc(supabase, data.id);
  });

/** Exported limit for client-side pre-check UX. */
export const VAULT_UPLOAD_MAX_BYTES = VAULT_MAX_BYTES;

// ─── Delete ────────────────────────────────────────────────────────────────
export const deleteVaultDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertAdmin(supabase, userId);
    const { data: row } = await supabase
      .from("mission_vault_documents")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase
      .from("mission_vault_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.file_path) {
      await supabase.storage.from("mission-library").remove([row.file_path]);
    }
    return { ok: true };
  });

// ─── Signed URL for download ───────────────────────────────────────────────
export const getVaultDocUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: row, error } = await supabase
      .from("mission_vault_documents")
      .select("file_path, external_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Document not found");
    if (row.external_url) return { url: row.external_url as string };
    if (!row.file_path) throw new Error("No file attached");
    const { data: signed, error: sErr } = await supabase.storage
      .from("mission-library")
      .createSignedUrl(row.file_path, 60 * 10);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl as string };
  });
