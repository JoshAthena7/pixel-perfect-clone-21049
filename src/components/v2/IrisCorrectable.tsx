import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag, X, Check } from "lucide-react";
import { submitIrisCorrection } from "@/lib/iris-correction.functions";

export type IrisContentType =
  | "mission_brief"
  | "question_brief"
  | "oracle_section"
  | "ask_iris"
  | "morning_brief"
  | "onboarding"
  | "other";

type Props = {
  /** What kind of IRIS block this is — used for the corrections log */
  contentType: IrisContentType;
  /** The IRIS-generated text being flagged (pre-fills "What IRIS said") */
  contentBlock: string;
  missionId: string | null | undefined;
  questionId?: string | null;
  /** Optional className for the wrapper (positions the flag) */
  className?: string;
  /** Render children inside the relatively-positioned wrapper. If false,
      caller is responsible for positioning. Default true. */
  wrap?: boolean;
  children?: React.ReactNode;
  /** Where to anchor the flag icon inside the wrapper */
  flagPosition?: "top-right" | "inline";
};

/**
 * IrisCorrectable — wraps any IRIS-generated block with a flag icon and an
 * inline correction panel. Anyone on the mission can flag and correct.
 */
export function IrisCorrectable({
  contentType,
  contentBlock,
  missionId,
  questionId,
  className,
  wrap = true,
  children,
  flagPosition = "top-right",
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!missionId) {
    // No mission context — render children passthrough
    return <>{children}</>;
  }

  const flag = (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      title="Flag an IRIS error"
      aria-label="Flag an IRIS error"
      className={
        flagPosition === "top-right"
          ? "absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-yellow-500/10 hover:text-yellow-400"
          : "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-yellow-500/10 hover:text-yellow-400"
      }
    >
      <Flag className="h-3.5 w-3.5" />
    </button>
  );

  const panel = open ? (
    <CorrectionPanel
      contentType={contentType}
      contentBlock={contentBlock}
      missionId={missionId}
      questionId={questionId ?? null}
      onClose={() => setOpen(false)}
      onSubmitted={() => {
        setSubmitted(true);
        setOpen(false);
      }}
    />
  ) : null;

  if (!wrap) {
    return (
      <>
        {flag}
        {panel}
      </>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      {flag}
      {submitted && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
          <Check className="h-3 w-3" /> Correction submitted — IRIS will use this going forward
        </div>
      )}
      {children}
      {panel}
    </div>
  );
}

function CorrectionPanel({
  contentType,
  contentBlock,
  missionId,
  questionId,
  onClose,
  onSubmitted,
}: {
  contentType: IrisContentType;
  contentBlock: string;
  missionId: string;
  questionId: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [whatIrisSaid, setWhatIrisSaid] = useState(contentBlock);
  const [correct, setCorrect] = useState("");
  const [criticality, setCriticality] = useState<"critical" | "minor" | "small">("critical");
  const [scope, setScope] = useState<"response" | "mission" | "global">("global");
  const qc = useQueryClient();
  const submit = useServerFn(submitIrisCorrection);

  const mut = useMutation({
    mutationFn: () =>
      submit({
        data: {
          missionId,
          questionId,
          contentType,
          contentBlock,
          incorrectText: whatIrisSaid.trim(),
          correctText: correct.trim(),
          criticality,
          scope,
        },
      }),
    onSuccess: () => {
      toast.success("Correction submitted — IRIS has learned");
      qc.invalidateQueries({ queryKey: ["iris-corrections"] });
      qc.invalidateQueries({ queryKey: ["iris-memories"] });
      onSubmitted();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit correction"),
  });

  const canSubmit = whatIrisSaid.trim().length > 0 && correct.trim().length > 0 && !mut.isPending;

  return (
    <div
      className="mt-3 rounded-md border p-4 text-sm"
      style={{
        background: "rgba(245,158,11,0.04)",
        borderColor: "rgba(245,158,11,0.30)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-400">
          <Flag className="h-3.5 w-3.5" /> Flag an IRIS error
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Field label="What IRIS said">
        <textarea
          value={whatIrisSaid}
          onChange={(e) => setWhatIrisSaid(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-md border bg-background/40 px-3 py-2 text-[13px] outline-none"
          style={{ borderColor: "rgba(245,158,11,0.3)" }}
        />
      </Field>

      <Field label="What is actually correct">
        <textarea
          value={correct}
          onChange={(e) => setCorrect(e.target.value)}
          rows={3}
          required
          placeholder="Type the correct information here…"
          className="w-full resize-none rounded-md border bg-background/40 px-3 py-2 text-[13px] outline-none focus:border-emerald-500/50"
          style={{ borderColor: "rgba(16,185,129,0.25)" }}
        />
      </Field>

      <Field label="How critical is this?">
        <Pills
          value={criticality}
          onChange={(v) => setCriticality(v as any)}
          options={[
            { v: "critical", label: "Changes what we write" },
            { v: "minor", label: "Misleading but minor" },
            { v: "small", label: "Small inaccuracy" },
          ]}
          accent="rgba(245,158,11,0.5)"
        />
      </Field>

      <Field label="Where should this fix apply?">
        <Pills
          value={scope}
          onChange={(v) => setScope(v as any)}
          options={[
            { v: "global", label: "Everywhere IRIS uses this" },
            { v: "mission", label: "This entire mission" },
            { v: "response", label: "Just this response" },
          ]}
          accent="rgba(34,211,238,0.5)"
        />
        {scope === "response" && (
          <p className="mt-1.5 text-[11px] text-yellow-400/80">
            ⚠ This correction won't prevent IRIS from making the same mistake elsewhere.
          </p>
        )}
      </Field>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => mut.mutate()}
        className="mt-2 w-full rounded-md border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-40"
        style={{
          background: "rgba(245,158,11,0.15)",
          borderColor: "rgba(245,158,11,0.4)",
          color: "#facc15",
        }}
      >
        {mut.isPending ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
            IRIS is processing your correction…
          </span>
        ) : (
          "Send Correction"
        )}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Pills<T extends string>({
  value,
  onChange,
  options,
  accent,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ v: T; label: string }>;
  accent: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className="rounded-full border px-3 py-1 text-[11px] transition-colors"
            style={{
              background: active ? accent.replace("0.5)", "0.12)") : "transparent",
              borderColor: active ? accent : "rgba(255,255,255,0.1)",
              color: active ? "white" : "var(--muted-foreground)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
