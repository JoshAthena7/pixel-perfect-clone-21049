// Per-mission Vault: client reference documents (DSR, contract, SOW, style guide, other).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const VAULT_DOC_TYPES = [
  "data_security",
  "contract",
  "scope_of_work",
  "style_guide",
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

    if (!data.filePath && !data.externalUrl) {
      throw new Error("Either a file upload or an external link is required.");
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
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as VaultDoc;
  });

// ─── Delete ────────────────────────────────────────────────────────────────
export const deleteVaultDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
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
