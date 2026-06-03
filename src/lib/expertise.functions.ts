import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { supabase, userId } = context;

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

    // Pull all available profiles (exclude requester)
    const { data: profiles = [] } = await supabase
      .from("profiles")
      .select(
        "id,display_name,email,avatar_color,avatar_url,expertise_areas,states_experience,programs_experience,question_types,notable_wins,availability_status,availability_until,availability_note,expert_bio,profile_completed",
      )
      .eq("availability_status", "available")
      .neq("id", userId);

    const qText = `${q.title ?? ""} ${q.question_text ?? ""}`;
    const qTokens = tokens(qText);

    const scored: ExpertMatch[] = (profiles as ExpertProfile[]).map((p) => {
      const reasons: string[] = [];
      let bonus = 0;

      // semantic-ish proxy via expertise/question-type/area token overlap
      const expertiseTokens = tokens(
        [
          ...(p.expertise_areas ?? []),
          ...(p.question_types ?? []),
          p.expert_bio ?? "",
        ].join(" "),
      );
      const semantic = Math.min(1, overlap(qTokens, expertiseTokens) / 4);

      // State match
      if (m.state && (p.states_experience ?? []).map((s) => s.toUpperCase()).includes(String(m.state).toUpperCase())) {
        bonus += 0.2;
        reasons.push(`worked in ${m.state}`);
      }

      // Program match (loose: substring on program_type)
      const program = String(m.program_type ?? "").toLowerCase();
      if (
        program &&
        (p.programs_experience ?? []).some((prog) =>
          prog.toLowerCase().includes(program) || program.includes(prog.toLowerCase()),
        )
      ) {
        bonus += 0.2;
        reasons.push(`experience with ${m.program_type}`);
      }

      // Question-type match — top weight
      const qTypeMatches = (p.question_types ?? []).filter((qt) =>
        qText.toLowerCase().includes(qt.toLowerCase()),
      );
      if (qTypeMatches.length > 0) {
        bonus += 0.25;
        reasons.push(`writes ${qTypeMatches[0]} questions`);
      }

      // Notable wins matching question type
      const winMatch = (p.notable_wins ?? []).find((w) =>
        w.question_type && qText.toLowerCase().includes(w.question_type.toLowerCase()),
      );
      if (winMatch) {
        bonus += 0.25;
        reasons.push(
          `scored ${winMatch.score ?? "?"} on ${winMatch.question_type}${winMatch.year ? ` in ${winMatch.year}` : ""}`,
        );
      }

      return { ...p, score: semantic + bonus, reasons };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 4);
    const primary = top[0] ?? null;
    const alternatives = top.slice(1);

    // Try Lovable AI for a one-liner — fall back to a deterministic sentence
    let iris_line: string | null = null;
    if (primary) {
      const firstName = (primary.display_name ?? "Your colleague").split(/\s+/)[0];
      iris_line = primary.reasons.length
        ? `${firstName} is a strong match because they ${primary.reasons.slice(0, 2).join(" and ")}.`
        : `${firstName} is available and most closely aligned with this question.`;

      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                    "You are IRIS, an expert recommender. Reply with ONE specific sentence (max 35 words) explaining why this person is the right call for this question. Reference their concrete experience — not generic qualities.",
                },
                {
                  role: "user",
                  content: `QUESTION (Q${q.question_number}): ${q.title}\n\n${q.question_text ?? ""}\n\nMISSION: ${m.name} · ${m.state ?? ""} · ${m.program_type ?? ""}\n\nRECOMMENDED: ${primary.display_name}\nExpertise: ${(primary.expertise_areas ?? []).join(", ")}\nStates: ${(primary.states_experience ?? []).join(", ")}\nPrograms: ${(primary.programs_experience ?? []).join(", ")}\nWins: ${JSON.stringify(primary.notable_wins ?? [])}\nBio: ${primary.expert_bio ?? ""}\n\nReasons we matched them: ${primary.reasons.join("; ")}`,
                },
              ],
            }),
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
