import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/time";
import { LoadingSkeleton, ErrorBanner } from "@/components/war-room/LoadState";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({ meta: [{ title: "Activity Log — Athena" }] }),
  component: () => <Navigate to="/select-engagement" replace />,
});

type Entry = {
  id: string;
  actor_name: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function ActivityGate() {
  const { loading, isLeadership } = useEngagement();
  if (loading) return null;
  if (!isLeadership) return <Navigate to="/huddle" replace />;
  return <ActivityPage />;
}

function ActivityPage() {
  const { engagement } = useEngagement();
  const [rows, setRows] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!engagement) return;
    setIsLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("activity_log")
      .select("id, actor_name, action, target_table, target_id, metadata, created_at")
      .eq("engagement_id", engagement.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setIsLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((data as Entry[]) ?? []);
  }, [engagement?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ScrollText className="h-5 w-5" /> Activity Log
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 20 significant events on this engagement. Leadership only.
        </p>
      </div>

      <ErrorBanner error={error} onRetry={load} label="Couldn't load activity." />

      <Card className="border-border bg-surface p-6">
        {isLoading && rows.length === 0 ? (
          <LoadingSkeleton label="Loading activity…" />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No activity logged yet. Significant events will appear here as they happen.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-border bg-surface-hover/40 px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{r.actor_name}</span>
                  <span className="text-muted-foreground">{r.action}</span>
                  {r.target_table && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.target_table}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {relativeTime(r.created_at)}
                  </span>
                </div>
                {r.metadata && Object.keys(r.metadata).length > 0 && (
                  <pre className="mt-1.5 overflow-x-auto rounded bg-background/40 p-2 text-[11px] text-muted-foreground">
                    {JSON.stringify(r.metadata, null, 0)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
