import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractListText } from "@/components/briefing-room/format";

/**
 * Win Theme Coverage — visual coverage indicator that lists each active win theme
 * and shows a progress bar based on how many approved ORACLE signals reference it
 * (matched by theme title token OR a configured win_theme_keyword).
 *
 * Renders directly under "How We Win" (OracleCanvas win themes) in the Briefing Room.
 */

const GOLD = "#C9A55C";

type Theme = { title: string; keywords: string[] };

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length >= 4);
}

function coverageColor(pct: number): string {
  if (pct >= 0.66) return "#6fcf97";
  if (pct >= 0.33) return GOLD;
  return "#f08080";
}

function coverageLabel(pct: number, count: number): string {
  if (count === 0) return "No coverage";
  if (pct >= 0.66) return "Strong";
  if (pct >= 0.33) return "Partial";
  return "Thin";
}

export function WinThemeCoverageCard({ missionId }: { missionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["win-theme-coverage", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    queryFn: async () => {
      const [wsRes, cfgRes, sigRes] = await Promise.all([
        supabase
          .from("mission_win_strategy")
          .select("win_themes")
          .eq("mission_id", missionId)
          .maybeSingle(),
        supabase
          .from("mission_iris_config")
          .select("win_theme_keywords")
          .eq("mission_id", missionId)
          .maybeSingle(),
        supabase
          .from("oracle_signals")
          .select("title, summary")
          .eq("mission_id", missionId)
          .in("status", ["approved", "pushed"])
          .limit(200),
      ]);

      const rawThemes = Array.isArray((wsRes.data as any)?.win_themes)
        ? ((wsRes.data as any).win_themes as unknown[])
        : [];
      const configKw = Array.isArray((cfgRes.data as any)?.win_theme_keywords)
        ? ((cfgRes.data as any).win_theme_keywords as string[])
        : [];

      const themes: Theme[] = rawThemes
        .map((t) => extractListText(t))
        .filter(Boolean)
        .map((title) => {
          const themeTokens = tokens(title);
          const matchingCfg = configKw.filter((kw) =>
            themeTokens.some((tt) => normalize(kw).includes(tt) || tt.includes(normalize(kw))),
          );
          return { title, keywords: Array.from(new Set([...themeTokens, ...matchingCfg.map(normalize)])) };
        });

      const signals = (sigRes.data ?? []) as Array<{ headline: string; iris_assessment: string | null }>;
      const haystacks = signals.map((s) => normalize(`${s.headline} ${s.iris_assessment ?? ""}`));

      const coverages = themes.map((th) => {
        const matched = haystacks.filter((h) =>
          th.keywords.some((kw) => kw.length >= 4 && h.includes(kw)),
        );
        const count = matched.length;
        // Cap at 5 references for "full" coverage.
        const pct = Math.min(count / 5, 1);
        return { theme: th.title, count, pct };
      });

      return { coverages, totalSignals: signals.length };
    },
  });

  if (isLoading) {
    return (
      <section
        className="rounded-xl px-5 py-4"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
          WIN THEME COVERAGE
        </div>
        <div className="mt-3 text-[12px] text-white/40">Calculating…</div>
      </section>
    );
  }

  const coverages = data?.coverages ?? [];
  if (coverages.length === 0) return null;

  return (
    <section
      className="rounded-xl px-5 py-4"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-baseline justify-between">
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
          WIN THEME COVERAGE
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
          {data?.totalSignals ?? 0} approved signals
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {coverages.map((c) => {
          const color = coverageColor(c.pct);
          return (
            <div key={c.theme}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-white/85 truncate" style={{ fontSize: 12, lineHeight: 1.4 }}>
                  {c.theme}
                </div>
                <div
                  className="shrink-0 tabular-nums"
                  style={{ fontSize: 10, color, fontWeight: 600 }}
                >
                  {coverageLabel(c.pct, c.count)} · {c.count}
                </div>
              </div>
              <div
                className="mt-1.5 rounded-full overflow-hidden"
                style={{ height: 4, background: "rgba(255,255,255,0.06)" }}
              >
                <div
                  style={{
                    width: `${Math.max(c.pct * 100, c.count > 0 ? 6 : 0)}%`,
                    height: "100%",
                    background: color,
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[10px] text-white/35 leading-snug">
        Coverage = approved ORACLE signals whose intel references this theme. Thin coverage = brief this theme harder before submission.
      </div>
    </section>
  );
}
