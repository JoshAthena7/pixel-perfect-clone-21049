// S-3: Internal Incident Response Plan page.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldAlert, Pencil, Save, X } from "lucide-react";
import {
  getIncidentResponsePlan,
  saveIncidentResponsePlan,
} from "@/lib/incident-response.functions";

export const Route = createFileRoute("/_authenticated/admin/incident-response")({
  component: IncidentResponsePage,
});

const SECTIONS = [
  { key: "classification", label: "Incident Classification", help: "What counts as a security incident." },
  { key: "immediate_response", label: "Immediate Response Steps", help: "Who to notify within 1 hour." },
  { key: "notification_obligations", label: "Notification Obligations", help: "Regulatory bodies and affected users." },
  { key: "evidence_preservation", label: "Evidence Preservation", help: "Do not delete logs." },
  { key: "recovery_checklist", label: "Recovery Checklist", help: "Steps to confirm full recovery." },
] as const;

type Plan = {
  id?: string;
  classification: string;
  immediate_response: string;
  notification_obligations: string;
  evidence_preservation: string;
  recovery_checklist: string;
  updated_at?: string;
};

function IncidentResponsePage() {
  const qc = useQueryClient();
  const loadFn = useServerFn(getIncidentResponsePlan);
  const saveFn = useServerFn(saveIncidentResponsePlan);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["incident-response-plan"],
    queryFn: () => loadFn() as Promise<Plan | null>,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Plan | null>(null);

  useEffect(() => {
    if (plan && !editing) setDraft(plan);
  }, [plan, editing]);

  async function save() {
    if (!draft) return;
    try {
      await saveFn({ data: draft });
      toast.success("Incident response plan saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["incident-response-plan"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Security</div>
          <h1 className="h1-display mt-1 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" /> Incident Response Plan
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Structured playbook for responding to suspected security incidents on the Atlas platform.
          </p>
          {plan?.updated_at && (
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              Last updated {new Date(plan.updated_at).toLocaleString()}
            </p>
          )}
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setDraft(plan ?? null); }} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs">
              <X className="h-3 w-3" /> Cancel
            </button>
            <button onClick={save} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90">
              <Save className="h-3 w-3" /> Save
            </button>
          </div>
        )}
      </header>

      {isLoading || !draft ? (
        <div className="py-12 text-center text-sm text-muted-foreground">One moment…</div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.key} className="rounded-md border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold">{s.label}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{s.help}</p>
              {editing ? (
                <textarea
                  rows={6}
                  value={(draft as any)[s.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
                  className="mt-3 w-full rounded border border-border bg-background px-2 py-1.5 text-sm font-mono"
                />
              ) : (
                <pre className="mt-3 whitespace-pre-wrap text-sm text-foreground/90 font-sans">
                  {(plan as any)?.[s.key] || "—"}
                </pre>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
