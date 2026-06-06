import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runIrisHealthCheck, type HealthCheckReport, type CheckResult } from "@/lib/iris-health-check.functions";
import { Activity, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

function StatusIcon({ status }: { status: CheckResult["status"] }) {
  if (status === "green") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "amber") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-red-400" />;
}

function verdictMeta(v: HealthCheckReport["verdict"]) {
  if (v === "green") return { dot: "🟢", label: "GREEN", line: "All systems nominal. Safe to activate.", cls: "border-emerald-500/30 bg-emerald-500/[0.04]" };
  if (v === "amber") return { dot: "🟡", label: "AMBER", line: "IRIS will function with degraded capabilities. Fix before high-stakes mission.", cls: "border-amber-500/30 bg-amber-500/[0.04]" };
  return { dot: "🔴", label: "RED", line: "Critical checks failed. Do not activate a mission until resolved.", cls: "border-red-500/30 bg-red-500/[0.04]" };
}

export function IrisHealthCheckCard() {
  const { data: isAdmin } = useQuery({
    queryKey: ["iris-hc-is-admin"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return false;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.user.id)
        .eq("role", "admin");
      return (roles?.length ?? 0) > 0;
    },
  });

  const [report, setReport] = useState<HealthCheckReport | null>(null);
  const [showFixes, setShowFixes] = useState(false);

  const runFn = useServerFn(runIrisHealthCheck);
  const mutation = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (res) => {
      setReport(res);
      setShowFixes(false);
      const counts = res.checks.reduce(
        (a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }),
        {} as Record<string, number>,
      );
      toast.success(`Health check done in ${(res.totalMs / 1000).toFixed(1)}s — ${counts.green ?? 0} green, ${counts.amber ?? 0} amber, ${counts.red ?? 0} red`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Health check failed"),
  });

  if (!isAdmin) return null;

  const internal = report?.checks.filter((c) => c.group === "internal") ?? [];
  const external = report?.checks.filter((c) => c.group === "external") ?? [];
  const fails = report?.checks.filter((c) => c.status !== "green") ?? [];
  const v = report ? verdictMeta(report.verdict) : null;

  return (
    <section className="mt-6 rounded-[10px] border border-primary/30 bg-primary/[0.04] p-5" aria-label="IRIS health check">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
            Diagnostics
          </div>
          <h3 className="mt-1 text-base font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" /> IRIS Intel Health Check
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Lightweight diagnostic across every intelligence layer. Creates and deletes its own test data.
            Run after every deploy and before every mission activation.
          </p>
          {report && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Last run: {new Date(report.ranAt).toLocaleTimeString()} · {(report.totalMs / 1000).toFixed(1)}s
            </p>
          )}
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-primary/40 bg-primary/15 px-3 py-2 text-[12px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
        >
          {mutation.isPending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</>
          ) : (
            <>⚡ {report ? "Run Again" : "Run Health Check"}</>
          )}
        </button>
      </div>

      {report && v && (
        <div className="mt-5 space-y-4">
          <Group title="Internal Pipeline" checks={internal} />
          <Group title="External Sources" checks={external} />

          <div className={`rounded-md border p-4 ${v.cls}`}>
            <div className="text-sm font-semibold">
              {v.dot} {v.label} — {fails.length === 0 ? "0 issues found" : `${fails.length} issue${fails.length === 1 ? "" : "s"} found`}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">{v.line}</p>

            {fails.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowFixes((s) => !s)}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground hover:text-primary"
                >
                  <ChevronDown className={`h-3 w-3 transition ${showFixes ? "rotate-180" : ""}`} />
                  {showFixes ? "Hide" : "View"} Fix Details
                </button>
                {showFixes && (
                  <ul className="mt-3 space-y-2 text-[12px]">
                    {fails.map((c) => (
                      <li key={c.id} className="rounded-md border border-border bg-background/40 p-3">
                        <div className="flex items-center gap-2 font-medium">
                          <StatusIcon status={c.status} />
                          <span>{c.label}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground">{c.note}</div>
                        {c.fix && (
                          <div className="mt-1.5 text-[11px] text-muted-foreground">
                            <span className="font-mono text-foreground">{c.fix.file}</span> — {c.fix.detail}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Group({ title, checks }: { title: string; checks: CheckResult[] }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-background/30">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon status={c.status} />
              <span className="font-medium text-foreground">{c.label}</span>
              <span className="truncate text-muted-foreground">— {c.note}</span>
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{c.ms}ms</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
