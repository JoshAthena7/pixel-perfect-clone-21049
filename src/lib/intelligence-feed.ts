// Two-feed IRIS architecture: Horizon Feed (firm-wide) + Mission Intelligence Feed (mission-scoped).

export const HORIZON_CATEGORIES = [
  "CMS", "Medicaid", "Medicare", "LTSS", "HCBS", "Behavioral Health",
  "Health Equity", "Procurement", "MCO", "Provider", "Advocacy",
  "Legislative", "SDOH", "Child Welfare", "IDD", "Value-Based Care",
] as const;
export type HorizonCategory = (typeof HORIZON_CATEGORIES)[number];

export const HORIZON_FILTERS = ["All", "CMS", "Medicaid", "Procurement", "State", "MCO"] as const;

const CATEGORY_KEYWORDS: Record<HorizonCategory, string[]> = {
  CMS: ["cms ", "center for medicare", "centers for medicare", "centers for medicaid"],
  Medicaid: ["medicaid"],
  Medicare: ["medicare"],
  LTSS: ["ltss", "long-term services", "long term services"],
  HCBS: ["hcbs", "home and community"],
  "Behavioral Health": ["behavioral health", "mental health", "substance use", "sud "],
  "Health Equity": ["health equity", "disparit", "equity"],
  Procurement: ["rfp", "procurement", "solicitation", "bid ", "contract award"],
  MCO: ["mco", "managed care organization"],
  Provider: ["provider network", "provider rate"],
  Advocacy: ["advocacy", "advocate"],
  Legislative: ["congress", "senate", "house bill", "legislation", "bill ", "h.r. ", "s. "],
  SDOH: ["sdoh", "social determinants"],
  "Child Welfare": ["child welfare", "foster"],
  IDD: ["intellectual disabilit", "developmental disabilit", "i/dd", "idd "],
  "Value-Based Care": ["value-based", "value based", "vbc"],
};

/** Infer a category for a market_intelligence item from title+summary+source. */
export function inferCategory(item: { title?: string | null; summary?: string | null; source?: string | null; category?: string | null }): HorizonCategory | null {
  if (item.category && (HORIZON_CATEGORIES as readonly string[]).includes(item.category)) {
    return item.category as HorizonCategory;
  }
  const text = `${item.title ?? ""} ${item.summary ?? ""} ${item.source ?? ""}`.toLowerCase();
  for (const cat of HORIZON_CATEGORIES) {
    for (const kw of CATEGORY_KEYWORDS[cat]) {
      if (text.includes(kw)) return cat;
    }
  }
  return null;
}

export function matchesHorizonFilter(category: HorizonCategory | null, filter: string): boolean {
  if (filter === "All") return true;
  if (filter === "State") {
    // "State" filter = state-level intelligence (LTSS, HCBS, Procurement often)
    return category === "Procurement" || category === "MCO";
  }
  return category === filter;
}

// ─── Mission Intelligence relevance scoring ─────────────────────────────────

export type MissionProfile = {
  state: string | null;
  client: string | null;
  competitors: string[];
  win_themes: string[];
  priority_topics: string[];
  focus_areas: string[];
  search_terms: string[];
};


export type IntelItem = {
  id: string;
  title: string | null;
  summary: string | null;
  source: string | null;
  url: string | null;
  type: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
};

export type ScoredItem = {
  item: IntelItem;
  score: number;
  level: "HIGH" | "MEDIUM" | "LOW";
  matchedThemes: string[];
  matchedTopics: string[];
  matchedCompetitors: string[];
  mentionsState: boolean;
  mentionsClient: boolean;
  isFederal: boolean;
  insight: string;
};

function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// State abbreviation → full name (so "NJ" also matches "New Jersey" in article text)
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};
function mentionsStateAware(text: string, state: string | null): boolean {
  if (!state) return false;
  if (containsWord(text, state)) return true;
  const upper = state.trim().toUpperCase();
  const full = STATE_NAMES[upper];
  return !!full && containsWord(text, full);
}

export function scoreItem(item: IntelItem, profile: MissionProfile): ScoredItem {
  const text = `${item.title ?? ""} ${item.summary ?? ""}`.toLowerCase();
  let score = 0;

  const mentionsState = mentionsStateAware(text, profile.state);
  if (mentionsState) score += 4;

  const mentionsClient = !!profile.client && containsWord(text, profile.client);
  if (mentionsClient) score += 3;

  const matchedCompetitors = profile.competitors.filter((c) => c && containsWord(text, c));
  if (matchedCompetitors.length) score += 3;

  const matchedThemes = profile.win_themes.filter((t) => t && containsWord(text, t));
  score += matchedThemes.length * 2;

  const matchedTopics = profile.priority_topics.filter((t) => t && containsWord(text, t));
  score += matchedTopics.length * 2;

  const matchedFocus = profile.focus_areas.filter((t) => t && containsWord(text, t));
  score += matchedFocus.length * 2;

  const matchedTerms = profile.search_terms.filter((t) => t && containsWord(text, t));
  score += matchedTerms.length * 2;

  const isFederal = /\b(cms|federal register|hhs|congress|medicare|medicaid)\b/.test(text) || (item.source ?? "").toLowerCase().includes("federal");

  const allTopics = [...matchedThemes, ...matchedTopics, ...matchedFocus, ...matchedTerms];
  const level: ScoredItem["level"] = score >= 5 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW";

  // Compose IRIS Insight
  const bits: string[] = [];
  if (mentionsState) bits.push(`directly references ${profile.state}`);
  if (mentionsClient) bits.push(`mentions ${profile.client}`);
  if (matchedCompetitors.length) bits.push(`names competitor ${matchedCompetitors[0]}`);
  if (matchedThemes.length) bits.push(`reinforces win theme "${matchedThemes[0]}"`);
  if (matchedTopics.length) bits.push(`supports priority topic "${matchedTopics[0]}"`);
  if (matchedFocus.length) bits.push(`relevant to focus area "${matchedFocus[0]}"`);
  if (matchedTerms.length && !matchedFocus.length && !matchedTopics.length) bits.push(`matches IRIS search term "${matchedTerms[0]}"`);

  const insight = bits.length
    ? `This may strengthen your proposal — ${bits.join("; ")}.`
    : "Background context for the procurement landscape.";

  return { item, score, level, matchedThemes: allTopics, matchedTopics, matchedCompetitors, mentionsState, mentionsClient, isFederal, insight };
}


export function scoreAll(items: IntelItem[], profile: MissionProfile): ScoredItem[] {
  return items
    .map((i) => scoreItem(i, profile))
    .filter((s) => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = new Date(a.item.published_at ?? a.item.created_at).getTime();
      const db = new Date(b.item.published_at ?? b.item.created_at).getTime();
      return db - da;
    });
}
