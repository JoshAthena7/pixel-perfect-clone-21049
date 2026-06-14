/**
 * Firecrawl helper for IRIS daily monitor. Uses the Firecrawl connector
 * (FIRECRAWL_API_KEY env var) when available, otherwise falls back to a raw
 * fetch. Never throws — returns null on any failure so the caller keeps going.
 *
 * Server-only.
 */

type ScrapeResult = {
  /** Cleaned markdown content if Firecrawl was used; otherwise raw HTML. */
  content: string;
  /** Source used for the content so the caller can log/branch if needed. */
  source: "firecrawl" | "fetch";
  /** HTTP status when known (Firecrawl path doesn't expose one — uses 200). */
  status: number;
};

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";

export async function scrapeUrl(url: string): Promise<ScrapeResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(FIRECRAWL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          data?: { markdown?: string };
          markdown?: string;
        };
        const md = j.data?.markdown ?? j.markdown ?? "";
        if (md && md.trim().length > 0) {
          return { content: md, source: "firecrawl", status: 200 };
        }
        console.log("[firecrawl] empty markdown for", url, "— falling back to raw fetch");
      } else {
        console.log("[firecrawl] non-ok", res.status, url, "— falling back to raw fetch");
      }
    } catch (e) {
      console.log("[firecrawl] threw, falling back", url, e);
    }
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ATLAS-IRIS-Monitor/1.0 (+https://athenacommandcenter.com)" },
      redirect: "follow",
    });
    const body = await res.text();
    return { content: body, source: "fetch", status: res.status };
  } catch (e) {
    console.log("[firecrawl] raw fetch threw", url, e);
    return null;
  }
}
