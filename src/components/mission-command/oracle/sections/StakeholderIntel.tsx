import { useMemo, useState } from "react";
import { IntelPeople } from "../IntelPeople";
import { IntelOrganizations } from "../IntelOrganizations";
import { CompactSignalCard } from "./SignalCard";
import { GOLD } from "./coverage";

type Bucket =
  | "STATE LEADERSHIP"
  | "ADVOCACY"
  | "PROVIDERS"
  | "FEDERAL / CMS"
  | "OTHER";

const STATE_KEYS = ["fssa", "dmahs", "dcf", "dmha", "ompp", "state-agency", "dcsc"];
const ADVOCACY_KEYS = ["advocacy", "ciacc", "family", "grassroots", "stakeholder"];
const PROVIDER_KEYS = ["provider", "network", "community"];
const FEDERAL_KEYS = ["cms", "federal", "medicaid", "waiver"];

function classify(s: any): Bucket {
  const tags = ((s.topic_tags ?? []) as string[]).map((t) => t.toLowerCase());
  const src = (s.source_name ?? "").toLowerCase();
  const hay = [...tags, src];
  const any = (keys: string[]) => keys.some((k) => hay.some((h) => h.includes(k)));
  if (any(STATE_KEYS)) return "STATE LEADERSHIP";
  if (any(ADVOCACY_KEYS)) return "ADVOCACY";
  if (any(PROVIDER_KEYS)) return "PROVIDERS";
  if (any(FEDERAL_KEYS)) return "FEDERAL / CMS";
  return "OTHER";
}

const BUCKET_ORDER: Bucket[] = [
  "STATE LEADERSHIP",
  "ADVOCACY",
  "PROVIDERS",
  "FEDERAL / CMS",
  "OTHER",
];

export function StakeholderIntel({
  missionId,
  signals,
}: {
  missionId: string;
  signals: any[];
}) {
  const buckets = useMemo(() => {
    const m = new Map<Bucket, any[]>();
    for (const b of BUCKET_ORDER) m.set(b, []);
    const stakeholderCats = new Set([
      "field_intelligence",
      "stakeholder_communication",
      "regulatory_state",
      "regulatory_federal",
    ]);
    for (const s of signals) {
      if (!stakeholderCats.has(s.category)) continue;
      if (!["approved", "pushed", "needs_review"].includes(s.status)) continue;
      m.get(classify(s))!.push(s);
    }
    return m;
  }, [signals]);

  const hasAny = Array.from(buckets.values()).some((arr) => arr.length > 0);

  return (
    <section id="section-stakeholders" style={{ marginBottom: 32 }}>
      <h2
        style={{
          color: "white",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          marginBottom: 12,
        }}
      >
        STAKEHOLDER INTELLIGENCE
      </h2>

      {hasAny ? (
        BUCKET_ORDER.map((b) => {
          const items = buckets.get(b)!;
          if (items.length === 0) return null;
          return <Bucket key={b} label={b} items={items} />;
        })
      ) : (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
          No stakeholder signals classified yet.
        </div>
      )}

      {/* Legacy people / orgs tables stay accessible below for now */}
      <details className="mt-4">
        <summary
          style={{
            cursor: "pointer",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.4)",
            marginBottom: 8,
          }}
        >
          People & organization registry
        </summary>
        <div className="space-y-4 mt-3">
          <IntelPeople missionId={missionId} />
          <IntelOrganizations missionId={missionId} />
        </div>
      </details>
    </section>
  );
}

function Bucket({ label, items }: { label: Bucket; items: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 5);
  const hasMore = items.length > 5;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.45)",
          marginBottom: 6,
        }}
      >
        {label}{" "}
        <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>
          ({items.length})
        </span>
      </div>
      {visible.map((s) => (
        <CompactSignalCard key={s.id} signal={s} />
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            fontSize: 10,
            color: GOLD,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 0",
          }}
        >
          {expanded ? "Show less" : `Show ${items.length - 5} more`}
        </button>
      )}
    </div>
  );
}
