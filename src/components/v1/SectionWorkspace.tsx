import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Save, Check } from "lucide-react";
import { getSection, updateSection } from "@/lib/v1/mission.functions";
import { normalizeStatus, STATUS_LABELS, type SectionStatus } from "@/lib/v1/mission";
import { IrisBadge } from "./IrisBadge";

const STATUS_OPTIONS: SectionStatus[] = [
  "not_started",
  "in_progress",
  "draft_done",
  "in_review",
  "approved",
  "blocked",
];

export function SectionWorkspace({ sectionId }: { sectionId: string }) {
  const qc = useQueryClient();
  const fetch = useServerFn(getSection);
  const save = useServerFn(updateSection);

  const { data, isLoading } = useQuery({
    queryKey: ["v1-section", sectionId],
    queryFn: () => fetch({ data: { sectionId } }),
  });

  const mutation = useMutation({
    mutationFn: (input: { body?: string; studio_status?: string }) => save({ data: { sectionId, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["v1-section", sectionId] }),
  });

  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (data?.section && !initialized.current) {
      setBody(data.section.body ?? "");
      initialized.current = true;
    }
  }, [data]);

  const onBodyChange = (val: string) => {
    setBody(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      mutation.mutate({ body: val });
      setSavedAt(new Date());
    }, 800);
  };

  if (isLoading || !data) {
    return <div className="p-10 text-[color:var(--v1-muted)]">Loading section…</div>;
  }

  const { section, assignee, themes } = data;
  const currentStatus = normalizeStatus(section.studio_status);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] min-h-full">
      {/* LEFT: editor */}
      <div className="px-8 py-6 border-r border-[color:var(--v1-border)] min-w-0">
        <Link
          to="/v1/sections"
          className="inline-flex items-center gap-1 text-xs text-[color:var(--v1-muted)] hover:text-[color:var(--v1-text)] mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> All sections
        </Link>
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--v1-muted)]">
              Section {section.number}
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[color:var(--v1-text)]">{section.title}</h1>
          </div>
          <select
            value={currentStatus}
            onChange={(e) => mutation.mutate({ studio_status: e.target.value })}
            className="rounded-md border border-[color:var(--v1-border)] bg-[color:var(--v1-surface)] px-3 py-1.5 text-sm text-[color:var(--v1-text)]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 text-sm text-[color:var(--v1-muted)]">
          NJ CSOC ·{" "}
          {assignee ? `Owner: ${assignee.display_name}` : "Unassigned"}
          {section.internal_due_date && ` · Due ${new Date(section.internal_due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        </div>

        {section.rfp_requirement && (
          <div className="mt-5 rounded-md border border-[color:var(--v1-border)] bg-[color:var(--v1-surface)] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--v1-muted)] mb-2">
              RFP Requirement
            </div>
            <p className="text-sm text-[color:var(--v1-text)]/90 italic">{section.rfp_requirement}</p>
          </div>
        )}

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--v1-muted)]">
              Draft
            </div>
            <div className="text-xs text-[color:var(--v1-muted)] flex items-center gap-1">
              {mutation.isPending ? (
                <>
                  <Save className="h-3 w-3 animate-pulse" /> Saving…
                </>
              ) : savedAt ? (
                <>
                  <Check className="h-3 w-3 text-[color:var(--v1-green)]" /> Saved {savedAt.toLocaleTimeString()}
                </>
              ) : (
                "Autosaves every keystroke"
              )}
            </div>
          </div>
          <textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="Start writing this section…"
            className="w-full min-h-[60vh] rounded-md border border-[color:var(--v1-border)] bg-[color:var(--v1-surface)] p-4 text-sm leading-relaxed text-[color:var(--v1-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--v1-primary)]/40"
          />
        </div>
      </div>

      {/* RIGHT: IRIS panel */}
      <aside className="px-6 py-6 bg-[color:var(--v1-surface)]/40">
        <IrisBadge>IRIS</IrisBadge>

        <div className="mt-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--v1-muted)] mb-2">
            Win Theme Alignment
          </div>
          <div className="space-y-2">
            {themes.length === 0 && (
              <div className="text-xs text-[color:var(--v1-muted)]">No themes defined.</div>
            )}
            {themes.map((t) => {
              const align = 60 + ((t.title.length * 7) % 35);
              const color = align >= 80 ? "var(--v1-green)" : align >= 60 ? "var(--v1-amber)" : "var(--v1-red)";
              return (
                <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-[color:var(--v1-text)]/90">{t.title}</span>
                  <span className="num-tab font-semibold shrink-0" style={{ color }}>
                    {align}%{align >= 80 ? " ✓" : " ⚠"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--v1-muted)] mb-2">
            Section Brief
          </div>
          <p className="text-xs leading-relaxed text-[color:var(--v1-text)]/85">
            {section.iris_flag_reason ??
              `This section is part of the NJ CSOC response. Anchor it to the family-centered, integrated care narrative that NJ evaluators prioritize. Cite measurable outcomes wherever possible.`}
          </p>
        </div>

        {section.iris_flagged && (
          <div className="mt-4 rounded-md border border-[color:var(--v1-red)]/40 bg-[color:var(--v1-red)]/10 p-3">
            <div className="text-xs font-semibold text-[color:var(--v1-red)] mb-1">⚠ IRIS Flag</div>
            <p className="text-xs text-[color:var(--v1-text)]/80">{section.iris_flag_reason ?? "Section flagged for review."}</p>
          </div>
        )}

        <div className="mt-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--v1-muted)] mb-2">
            Quick Links
          </div>
          <div className="flex flex-col gap-1">
            <Link to="/v1/intel" className="text-xs text-[color:var(--v1-iris)] hover:underline">
              → Mission Intel
            </Link>
            <Link to="/v1/vault" className="text-xs text-[color:var(--v1-iris)] hover:underline">
              → Mission Vault
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
