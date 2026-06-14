/**
 * Stakeholder auto-enrichment via Perplexity.
 *
 * Fired fire-and-forget after a new person is added to `intel_people`.
 * Pulls policy background + recent activity with citations, then:
 *   - writes the synthesis into `intel_people.notes`
 *   - logs one `intel_events` row tagged as a stakeholder profile with
 *     citation URLs so the source trail is auditable.
 *
 * Server-only. Fail-soft.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ personId: z.string().uuid() });

export const enrichStakeholderWithPerplexity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: person, error } = await context.supabase
      .from("intel_people" as any)
      .select("id, mission_id, name, organization, title, notes")
      .eq("id", data.personId)
      .maybeSingle();
    if (error || !person) return { ok: false as const, reason: "person_not_found" };
    const p = person as {
      id: string;
      mission_id: string | null;
      name: string;
      organization: string | null;
      title: string | null;
      notes: string | null;
    };

    void (async () => {
      try {
        const { askPerplexity } = await import("./iris/perplexity.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const orgPart = p.organization ? ` ${p.organization}` : "";
        const titlePart = p.title ? ` ${p.title}` : "";
        const query = `${p.name}${titlePart}${orgPart} Medicaid healthcare policy background, recent activity, public statements 2024-2025`;

        const profile = await askPerplexity(query, {
          model: "sonar-pro",
          recencyFilter: "year",
          system:
            "You are IRIS profiling a stakeholder for Athena's proposal team. Write 4-6 sentences covering background, current role, policy positions, and notable recent activity. Be specific with dates, programs, and statements. Cite inline. If coverage is thin, say so plainly. No preamble.",
        });
        if (!profile?.content) return;

        const citations = (profile.citations ?? [])
          .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
          .slice(0, 8);
        const sourceBlock = citations.length
          ? `\n\nSources (live, via IRIS):\n${citations.map((u, i) => `[${i + 1}] ${u}`).join("\n")}`
          : "";
        const stamp = new Date().toISOString().slice(0, 10);
        const header = `IRIS stakeholder profile · ${stamp}`;
        const notesBlock = `${header}\n${profile.content}${sourceBlock}`;
        const nextNotes = p.notes && p.notes.trim().length > 0
          ? `${p.notes.trim()}\n\n---\n\n${notesBlock}`
          : notesBlock;

        await supabaseAdmin
          .from("intel_people" as any)
          .update({ notes: nextNotes })
          .eq("id", p.id);

        await supabaseAdmin.from("intel_events").insert({
          mission_id: p.mission_id,
          event_type: "stakeholder_profile",
          title: `Stakeholder profile: ${p.name}`,
          content: profile.content,
          source_type: "perplexity",
          source_title: orgPart ? `${p.name} —${orgPart}` : p.name,
          source_published_at: new Date().toISOString(),
          extracted_summary: profile.content.slice(0, 1000),
          output_type: "stakeholder_profile",
          signal_category: "stakeholder",
          entity_refs: [p.id],
          tags: citations,
          routing_status: "unreviewed",
          generated_by: "iris-perplexity",
          confidence: "medium",
        });
      } catch (e) {
        console.error("[stakeholder-enrich] background failure", e);
      }
    })();

    return { ok: true as const };
  });
