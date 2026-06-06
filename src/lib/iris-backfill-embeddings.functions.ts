import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LibResult = { table: string; total: number; already: number; embedded: number; failed: number };

export const backfillStaticEmbeddings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Admin gate
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { embed, storeEmbedding } = await import("@/lib/intel-enrich.server");

    async function backfillTable(opts: {
      table: "intelligence_canon" | "expertise_library" | "federal_compliance_library";
      select: string;
      idField: string;
      buildText: (row: Record<string, unknown>) => string;
    }): Promise<LibResult> {
      const result: LibResult = { table: opts.table, total: 0, already: 0, embedded: 0, failed: 0 };

      const { data: rows, error } = await supabaseAdmin
        .from(opts.table)
        .select(opts.select) as unknown as { data: Record<string, unknown>[] | null; error: unknown };
      if (error || !rows) return result;
      result.total = rows.length;

      // Find which source_ids already have embeddings (text ids cast to text comparison)
      const ids = rows.map((r) => String(r[opts.idField]));
      const { data: existing } = await supabaseAdmin
        .from("embeddings")
        .select("source_id")
        .eq("source_table", opts.table)
        .in("source_id", ids as never);
      const have = new Set((existing ?? []).map((e: { source_id: string }) => String(e.source_id)));

      // Concurrency-limited loop
      const queue = rows.filter((r) => !have.has(String(r[opts.idField])));
      result.already = result.total - queue.length;

      const CONCURRENCY = 4;
      let i = 0;
      async function worker() {
        while (i < queue.length) {
          const idx = i++;
          const row = queue[idx];
          const text = opts.buildText(row).slice(0, 6000).trim();
          if (!text) { result.failed++; continue; }
          try {
            const v = await embed(text);
            if (!v) { result.failed++; continue; }
            await storeEmbedding({
              source_table: opts.table,
              source_id: String(row[opts.idField]),
              mission_id: null,
              content_text: text,
              vector: v,
              scope: "global",
            });
            result.embedded++;
          } catch {
            result.failed++;
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      return result;
    }

    const results = await Promise.all([
      backfillTable({
        table: "intelligence_canon",
        select: "id,topic,category,content,citation,tags",
        idField: "id",
        buildText: (r) =>
          `${r.topic ?? ""}\n[${r.category ?? ""}]${r.citation ? ` (${r.citation})` : ""}\n\n${r.content ?? ""}\n${Array.isArray(r.tags) ? (r.tags as string[]).join(", ") : ""}`,
      }),
      backfillTable({
        table: "expertise_library",
        select: "id,label,category",
        idField: "id",
        buildText: (r) => `${r.label ?? ""} [${r.category ?? ""}]`,
      }),
      backfillTable({
        table: "federal_compliance_library",
        select: "id,regulation_name,citation,section_text,plain_language,requirement_type",
        idField: "id",
        buildText: (r) =>
          `${r.regulation_name ?? ""} — ${r.citation ?? ""}\n[${r.requirement_type ?? ""}]\n\n${r.plain_language ?? r.section_text ?? ""}`,
      }),
    ]);

    return { results, ok: true };
  });
