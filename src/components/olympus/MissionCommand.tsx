import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import MissionWizard from "@/components/olympus/MissionWizard";
import { supabase } from "@/integrations/supabase/client";

type MissionRow = {
  id: string;
  name: string;
  client: string | null;
  mission_status: string | null;
  status: string | null;
  submission_date: string | null;
  updated_at: string | null;
  created_at: string;
};

const GOLD = "#C9A84C";
const NAVY = "#1F3864";

export default function MissionCommand() {
  const [showWizard, setShowWizard] = useState(false);
  const qc = useQueryClient();

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ["olympus-missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id,name,client,mission_status,status,submission_date,updated_at,created_at")
        .order("updated_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as MissionRow[];
    },
  });

  const handleClose = () => {
    setShowWizard(false);
    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
  };

  return (
    <div className="flex-1 min-w-0 min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 pt-20 pb-12">
        <div className="text-center">
          <h1 className="text-[11px] font-extrabold uppercase tracking-[0.32em] text-muted-foreground">
            Olympus — Mission Setup Engine
          </h1>
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              className="w-full md:w-auto rounded-lg px-12 py-5 text-base font-bold uppercase tracking-[0.18em] shadow-lg transition hover:opacity-90 active:scale-[0.99]"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              Start a Mission
            </button>
          </div>
          {!isLoading && missions.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              No missions yet. Start one to begin.
            </p>
          )}
        </div>

        {missions.length > 0 && (
          <div className="mt-16">
            <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <Th>Mission Name</Th>
                    <Th>Client</Th>
                    <Th>Due Date</Th>
                    <Th>Status</Th>
                    <Th>Last Updated</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map((m) => (
                    <tr key={m.id} className="border-t border-border/60 hover:bg-surface-hover/40">
                      <Td className="font-medium text-foreground">{m.name}</Td>
                      <Td>{m.client ?? "—"}</Td>
                      <Td>{formatDate(m.submission_date)}</Td>
                      <Td><StatusBadge value={m.mission_status ?? m.status ?? "Draft"} /></Td>
                      <Td className="text-muted-foreground">{formatDate(m.updated_at ?? m.created_at)}</Td>
                      <Td className="text-right">
                        <Link
                          to="/admin/missions/$missionId"
                          params={{ missionId: m.id }}
                          className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium hover:bg-surface-hover"
                        >
                          Open
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showWizard && <MissionWizard open onClose={handleClose} />}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 text-left font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

function StatusBadge({ value }: { value: string }) {
  const v = value.trim();
  const styles: Record<string, { bg: string; fg: string; border: string; dot?: string }> = {
    "Draft": { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8", border: "rgba(148,163,184,0.35)" },
    "IRIS Review Needed": { bg: "rgba(59,130,246,0.15)", fg: "#60a5fa", border: "rgba(59,130,246,0.4)" },
    "Ready for Review": { bg: "rgba(245,158,11,0.15)", fg: "#fbbf24", border: "rgba(245,158,11,0.4)" },
    "Ready to Go Live": { bg: "transparent", fg: "#34d399", border: "rgba(52,211,153,0.6)" },
    "Live": { bg: "#10b981", fg: "#062b1d", border: "#10b981" },
    "Live with Pending Edits": { bg: "rgba(16,185,129,0.85)", fg: "#062b1d", border: "#10b981", dot: "#fbbf24" },
    "Locked": { bg: "rgba(51,65,85,0.6)", fg: "#cbd5e1", border: "rgba(51,65,85,0.8)" },
  };
  const s = styles[v] ?? styles["Draft"];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}
    >
      {s.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />}
      {v}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
