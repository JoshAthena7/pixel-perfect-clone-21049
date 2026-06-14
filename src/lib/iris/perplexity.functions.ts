/**
 * IRIS server functions wrapping Perplexity for "Ask IRIS with Sources".
 * Keeps PERPLEXITY_API_KEY server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  query: z.string().min(1).max(2000),
  model: z
    .enum(["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro", "sonar-deep-research"])
    .optional(),
  recencyFilter: z.enum(["day", "week", "month", "year"]).optional(),
  domainFilter: z.array(z.string().min(1).max(200)).max(20).optional(),
});

const DEFAULT_DOMAINS = [
  "cms.gov",
  "medicaid.gov",
  "kff.org",
  "nashp.org",
  "macpac.gov",
  "healthmanagement.com",
  "shvs.org",
];

const SYSTEM = `You are IRIS, an intelligence engine for Athena Strategy Group's ATLAS platform.
Answer the user's question with concise, accurate prose grounded in the cited sources.
Prefer recent, authoritative healthcare/Medicaid sources. Be specific. Cite inline.
If sources disagree or coverage is thin, say so plainly. No preamble.`;

export const askIrisWithSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { askPerplexity } = await import("./perplexity.server");
    const result = await askPerplexity(data.query, {
      model: data.model ?? "sonar-pro",
      system: SYSTEM,
      recencyFilter: data.recencyFilter ?? "month",
      domainFilter: data.domainFilter ?? DEFAULT_DOMAINS,
    });
    if (!result) {
      return {
        ok: false as const,
        content: "IRIS couldn't reach the source network just now. Try again in a moment.",
        citations: [] as Array<{ url: string; domain: string }>,
      };
    }
    const citations = (result.citations ?? [])
      .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
      .map((url) => {
        let domain = url;
        try {
          domain = new URL(url).hostname.replace(/^www\./, "");
        } catch { /* keep url */ }
        return { url, domain };
      });
    return { ok: true as const, content: result.content, citations };
  });
