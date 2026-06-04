import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

/* ───────────────────────── types returned to client ───────────────────────── */

export type ExpertProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  expertise_areas: string[];
  states_experience: string[];
  programs_experience: string[];
  question_types: string[];
  notable_wins: Array<{
    mission_name?: string;
    question_type?: string;
    score?: number;
    year?: number;
    notes?: string;
  }>;
  availability_status: "available" | "pens_down" | "unavailable" | "pto";
  availability_until: string | null;
  availability_note: string | null;
  expert_bio: string | null;
  profile_completed: boolean;
};

export type ExpertMatch = ExpertProfile & {
  score: number;
  reasons: string[];
};

export type MatchResult = {
  primary: ExpertMatch | null;
  alternatives: ExpertMatch[];
  iris_line: string | null;
};

/* ───────────────────────── matcher ───────────────────────── */

const MatchInput = z.object({
  questionId: z.string().uuid(),
  missionId: z.string().uuid(),
});

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s/&-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

export const matchExperts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MatchInput.parse(input))
  .handler(async ({ data, context }): Promise<MatchResult> => {
    const { supabase } = context;

    // Pull question + mission context
    const [{ data: q }, { data: m }] = await Promise.all([
      supabase
        .from("question_records")
        .select("id,question_number,title,question_text")
        .eq("id", data.questionId)
        .maybeSingle(),
      supabase
        .from("missions")
        .select("id,name,state,program_type")
        .eq("id", data.missionId)
        .maybeSingle(),
    ]);

    if (!q || !m) return { primary: null, alternatives: [], iris_line: null };

    // Source of truth for Phone-a-Friend = the Collective roster (Talentdesk
    // import). Skill tags drive the match.
    const { data: members = [] } = await supabase
      .from("collective_members")
      .select("id,full_name,email,title,location,skill_tags,notes")
      .eq("is_active", true);

    const qText = `${q.title ?? ""} ${q.question_text ?? ""}`;
    const qTokens = tokens(qText);
    const programText = String(m.program_type ?? "").toLowerCase();
    const stateText = String(m.state ?? "").toUpperCase();

    // Stable color per member id (so the avatar isn't random across reloads).
    const PALETTE = ["#3b7fff", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#06b6d4", "#ef4444", "#8b5cf6"];
    const colorFor = (id: string) => {
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      return PALETTE[h % PALETTE.length];
    };

    const scored: ExpertMatch[] = (members as any[]).map((mem) => {
      const reasons: string[] = [];
      let score = 0;
      const skills: string[] = mem.skill_tags ?? [];

      // 1. Skill-tag overlap with question text — primary signal.
      const skillTokens = tokens(skills.join(" "));
      const skillHits = overlap(qTokens, skillTokens);
      if (skillHits > 0) {
        score += Math.min(1, skillHits / 3) * 0.6;
        const matched = skills.filter((s) => qText.toLowerCase().includes(s.toLowerCase())).slice(0, 2);
        if (matched.length) reasons.push(`tagged ${matched.join(" & ")}`);
      }

      // 2. Direct skill_tag mention of program type.
      if (programText && skills.some((s) => s.toLowerCase().includes(programText) || programText.includes(s.toLowerCase()))) {
        score += 0.25;
        reasons.push(`${m.program_type} experience`);
      }

      // 3. Location / state alignment.
      const loc = String(mem.location ?? "").toUpperCase();
      if (stateText && loc.includes(stateText)) {
        score += 0.15;
        reasons.push(`based in ${m.state}`);
      }

      // 4. Title keyword bonus.
      const title = String(mem.title ?? "").toLowerCase();
      if (title && qTokens.size > 0) {
        const titleTokens = tokens(title);
        if (overlap(qTokens, titleTokens) > 0) {
          score += 0.1;
          reasons.push(mem.title);
        }
      }

      // Adapt collective_members → ExpertMatch shape used by the overlay.
      const match: ExpertMatch = {
        id: mem.id,
        display_name: mem.full_name,
        email: mem.email,
        avatar_color: colorFor(mem.id),
        avatar_url: null,
        expertise_areas: skills,
        states_experience: mem.location ? [mem.location] : [],
        programs_experience: mem.title ? [mem.title] : [],
        question_types: [],
        notable_wins: [],
        availability_status: "available",
        availability_until: null,
        availability_note: null,
        expert_bio: mem.notes ?? null,
        profile_completed: true,
        score,
        reasons,
      };
      return match;
    });

    // Keep only members with at least one signal; sort by score desc.
    const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, 4);
    const primary = top[0] ?? null;
    const alternatives = top.slice(1);

    // IRIS one-liner (best-effort).
    let iris_line: string | null = null;
    if (primary) {
      const firstName = (primary.display_name ?? "Your colleague").split(/\s+/)[0];
      iris_line = primary.reasons.length
        ? `${firstName} is a strong match because of their ${primary.reasons.slice(0, 2).join(" and ")}.`
        : `${firstName} is in the Collective and most closely aligned with this question.`;

      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        try {
          const resp = await withAICircuit(async () => {
            const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are IRIS, an expert recommender. Reply with ONE specific sentence (max 35 words) explaining why this Collective member is the right call for this question. Reference their concrete tags/title — not generic qualities.",
                  },
                  {
                    role: "user",
                    content: `QUESTION (Q${q.question_number}): ${q.title}\n\n${q.question_text ?? ""}\n\nMISSION: ${m.name} · ${m.state ?? ""} · ${m.program_type ?? ""}\n\nRECOMMENDED: ${primary.display_name}\nTitle: ${primary.programs_experience[0] ?? ""}\nLocation: ${primary.states_experience[0] ?? ""}\nSkill tags: ${primary.expertise_areas.join(", ")}\nNotes: ${primary.expert_bio ?? ""}\n\nReasons we matched them: ${primary.reasons.join("; ")}`,
                  },
                ],
              }),
            });
            if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
            return r;
          });
          if (resp.ok) {
            const json = await resp.json();
            const text = json?.choices?.[0]?.message?.content?.trim();
            if (text) iris_line = text;
          }
        } catch (e) {
          console.warn("IRIS one-liner generation failed", e);
        }
      }
    }

    return { primary, alternatives, iris_line };
  });

