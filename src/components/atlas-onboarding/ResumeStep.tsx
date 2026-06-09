import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  completeAtlasResumeStep,
  getAtlasOnboardingMemberId,
  parseAtlasResume,
  skipAtlasResumeStep,
  type ResumeParseResult,
} from "@/lib/atlas-onboarding-uploads.functions";
import {
  extractResumeText,
  isSupportedResumeMime,
} from "@/lib/atlas-onboarding-text-extract";

const GOLD = "#C9922A";
const NAVY = "#0D1B3E";
const CARD_BG = "#11214A";
const AMBER = "#F5B845";

const ACCEPTED_EXT = [".pdf", ".doc", ".docx"];
const ACCEPTED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_TTL = 60 * 60 * 24 * 365 * 5; // 5 years

type Phase = "idle" | "selected" | "processing" | "ready" | "parse_warn";

type Props = {
  onAdvanced: () => void;
  onBack: () => void;
};

export function ResumeStep({ onAdvanced, onBack }: Props) {
  const memberIdFn = useServerFn(getAtlasOnboardingMemberId);
  const parseFn = useServerFn(parseAtlasResume);
  const completeFn = useServerFn(completeAtlasResumeStep);
  const skipFn = useServerFn(skipAtlasResumeStep);

  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [parsed, setParsed] = useState<ResumeParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSkipPrompt, setShowSkipPrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 16);
    return () => window.clearTimeout(t);
  }, []);

  const acceptFile = useCallback(
    async (f: File | null) => {
      setError(null);
      if (!f) return;
      const isValid =
        ACCEPTED_MIME.includes(f.type) ||
        ACCEPTED_EXT.some((e) => f.name.toLowerCase().endsWith(e));
      if (!isValid) {
        setError(
          "That file type isn't supported. Please upload a PDF or Word document.",
        );
        return;
      }
      if (f.size > MAX_BYTES) {
        setError("That file is too large. Please upload a file under 10MB.");
        return;
      }
      setFile(f);
      setPhase("processing");
      setParsed(null);

      // Run extraction + AI parse.
      try {
        const text = isSupportedResumeMime(f.type)
          ? await extractResumeText(f)
          : "";
        if (!text || text.trim().length < 40) {
          setPhase("parse_warn");
          return;
        }
        const res = await parseFn({ data: { resumeText: text.slice(0, 80000) } });
        if (res.ok && res.parsed) {
          setParsed(res.parsed);
          setPhase("ready");
        } else {
          setPhase("parse_warn");
        }
      } catch (e) {
        console.error("[atlas-onboarding] resume parse pipeline failed", e);
        setPhase("parse_warn");
      }
    },
    [parseFn],
  );

  function clearFile() {
    setFile(null);
    setParsed(null);
    setPhase("idle");
    setError(null);
  }

  async function handleSubmit() {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { memberId } = await memberIdFn();
      const ext =
        file.name.split(".").pop()?.toLowerCase() ||
        (file.type === "application/pdf" ? "pdf" : "docx");
      const path = `${memberId}-resume.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("atlas-resumes")
        .upload(path, file, {
          upsert: true,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        });
      if (upErr) throw new Error(upErr.message);
      const { data: signed, error: sErr } = await supabase.storage
        .from("atlas-resumes")
        .createSignedUrl(path, SIGNED_TTL);
      if (sErr || !signed?.signedUrl) {
        throw new Error(sErr?.message ?? "Could not generate resume URL.");
      }
      await completeFn({
        data: {
          resumeUrl: signed.signedUrl,
          extractedSkills: parsed?.skills ?? [],
        },
      });
      onAdvanced();
    } catch (e: any) {
      console.error("[atlas-onboarding] resume submit failed", e);
      setError(
        e?.message ??
          "Something went wrong uploading your resume. Please try again.",
      );
      setSubmitting(false);
    }
  }

  async function handleSkipAnyway() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await skipFn();
      onAdvanced();
    } catch (e: any) {
      console.error("[atlas-onboarding] resume skip failed", e);
      setError(e?.message ?? "Couldn't continue. Please try again.");
      setSubmitting(false);
    }
  }

  const canSubmit =
    !!file && (phase === "ready" || phase === "parse_warn") && !submitting;

  return (
    <div className="relative w-full flex justify-center">
      <div className="w-full max-w-[560px] px-4">
        <button
          type="button"
          onClick={onBack}
          className="atlas-back-link mb-4 text-xs sm:text-sm"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          ← Back
        </button>

        <div
          className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.32em]"
          style={{ color: GOLD, ...revealStyle(mounted, 0) }}
        >
          Step 4 of 5
        </div>
        <h1
          className="mt-3 text-3xl sm:text-4xl font-semibold text-white"
          style={revealStyle(mounted, 200)}
        >
          Tell us what you bring.
        </h1>
        <p
          className="mt-4 text-sm sm:text-base"
          style={{
            color: "rgba(255,255,255,0.7)",
            ...revealStyle(mounted, 400),
          }}
        >
          Upload your resume and let ATLAS do the rest. We'll pull out your
          expertise, credentials, and specialties automatically.
        </p>

        {/* Upload zone OR processing OR results */}
        <div className="mt-8" style={revealStyle(mounted, 600)}>
          {phase === "idle" ? (
            <button
              ref={dropRef}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void acceptFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className="atlas-resume-drop w-full rounded-xl flex flex-col items-center justify-center text-center px-6"
              style={{
                height: "clamp(120px, 22vw, 160px)",
                background: dragging ? "rgba(201,146,42,0.06)" : NAVY,
                border: `2px dashed ${dragging ? GOLD : "rgba(201,146,42,0.55)"}`,
                transition: "all 180ms ease",
              }}
              aria-label="Upload resume"
            >
              <Upload size={28} color={GOLD} />
              <div className="mt-2 text-sm sm:text-base font-medium text-white">
                Drop your resume here or click to browse
              </div>
              <div
                className="mt-1 text-[11px] sm:text-xs"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                PDF or Word document · Max 10MB
              </div>
            </button>
          ) : phase === "processing" ? (
            <div
              className="w-full rounded-xl flex flex-col items-center justify-center text-center px-6 py-10"
              style={{
                background: NAVY,
                border: `1px solid rgba(201,146,42,0.45)`,
              }}
            >
              <div className="atlas-pulse-ring" />
              <div className="mt-5 text-base font-medium text-white">
                IRIS is reading your resume…
              </div>
              <div
                className="mt-1 text-xs sm:text-sm"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                Extracting your expertise, credentials, and specialties
              </div>
            </div>
          ) : (
            <FileChip file={file!} onClear={clearFile} />
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXT.join(",")}
            className="hidden"
            onChange={(e) => void acceptFile(e.target.files?.[0] ?? null)}
          />

          {error && (
            <p className="mt-3 text-xs sm:text-sm" style={{ color: AMBER }}>
              {error}
            </p>
          )}
        </div>

        {/* Extracted data preview */}
        {phase === "ready" && parsed && (
          <div
            className="mt-6 rounded-xl p-5"
            style={{
              background: CARD_BG,
              borderLeft: `3px solid ${GOLD}`,
              animation: "atlas-step-reveal 500ms ease-out both",
            }}
          >
            <div className="text-sm font-bold uppercase tracking-wider" style={{ color: GOLD }}>
              Here's what we found
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {parsed.skills.length > 0 && (
                <ExtractedRow
                  label="Skills"
                  value={parsed.skills.slice(0, 8).join(", ")}
                />
              )}
              {parsed.credentials.length > 0 && (
                <ExtractedRow
                  label="Credentials"
                  value={parsed.credentials.join(", ")}
                />
              )}
              {typeof parsed.years_of_experience === "number" && (
                <ExtractedRow
                  label="Experience"
                  value={`${parsed.years_of_experience}+ years`}
                />
              )}
              {parsed.healthcare_specialties.length > 0 && (
                <ExtractedRow
                  label="Specialties"
                  value={parsed.healthcare_specialties.join(", ")}
                />
              )}
              {parsed.skills.length === 0 &&
                parsed.credentials.length === 0 &&
                parsed.healthcare_specialties.length === 0 && (
                  <li style={{ color: "rgba(255,255,255,0.7)" }}>
                    No clear keywords detected — your resume is saved and you can
                    edit your profile anytime.
                  </li>
                )}
            </ul>
            <p
              className="mt-4 text-[11px] sm:text-xs"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Not quite right? You can update your profile anytime after
              onboarding.
            </p>
          </div>
        )}

        {/* Parse warning — proceed anyway */}
        {phase === "parse_warn" && file && (
          <div
            className="mt-6 rounded-xl p-4"
            style={{
              background: "rgba(245,184,69,0.08)",
              border: `1px solid rgba(245,184,69,0.4)`,
            }}
          >
            <p className="text-xs sm:text-sm" style={{ color: AMBER }}>
              We had trouble reading that file. Your resume is saved and our
              team will review it. You can continue.
            </p>
          </div>
        )}

        {/* The tease — only after a successful parse */}
        {phase === "ready" && parsed && (
          <div
            className="mt-8 pt-6 text-center"
            style={{
              borderTop: `1px solid rgba(201,146,42,0.35)`,
              animation: "atlas-step-reveal 600ms ease-out both",
              animationDelay: "600ms",
            }}
          >
            <div
              className="inline-block px-4 py-2 rounded-lg"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(201,146,42,0.18) 0%, rgba(13,27,62,0) 70%)",
              }}
            >
              <p
                className="italic text-sm sm:text-base font-medium"
                style={{ color: GOLD }}
              >
                ✦ This also powers something we're building just for you.
              </p>
              <p
                className="mt-1 text-xs sm:text-sm"
                style={{ color: "rgba(255,255,255,0.75)" }}
              >
                We can't say much yet — but your expertise is about to work
                harder than you think. 👀
              </p>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-center gap-3">
          {canSubmit && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="atlas-welcome-cta inline-flex items-center justify-center gap-2 rounded-xl font-bold px-8 py-3.5 text-base w-4/5 sm:w-auto"
              style={{
                background: GOLD,
                color: NAVY,
                boxShadow: "0 8px 24px rgba(201,146,42,0.25)",
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Looks good, let's go <span aria-hidden>→</span>
            </button>
          )}

          {!showSkipPrompt ? (
            <button
              type="button"
              onClick={() => setShowSkipPrompt(true)}
              disabled={submitting}
              className="atlas-skip-link text-sm underline underline-offset-4"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              Skip for now
            </button>
          ) : (
            <div
              className="mt-2 w-full max-w-md rounded-lg p-4 text-center"
              style={{
                background: "rgba(245,184,69,0.08)",
                border: `1px solid rgba(245,184,69,0.4)`,
              }}
            >
              <p className="text-xs sm:text-sm" style={{ color: AMBER }}>
                You can upload your resume anytime from your profile. Some
                ATLAS features work better with it.
              </p>
              <div className="mt-3 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleSkipAnyway}
                  disabled={submitting}
                  className="text-xs sm:text-sm underline underline-offset-4"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {submitting ? "Saving…" : "Skip anyway"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSkipPrompt(false);
                    window.setTimeout(
                      () =>
                        phase === "idle"
                          ? dropRef.current?.focus()
                          : inputRef.current?.click(),
                      0,
                    );
                  }}
                  className="text-xs sm:text-sm font-semibold underline underline-offset-4"
                  style={{ color: GOLD }}
                >
                  Upload resume
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes atlas-step-reveal {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes atlas-pulse-ring {
          0%   { transform: scale(0.6); opacity: 0.9; }
          70%  { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .atlas-pulse-ring {
          position: relative;
          width: 56px; height: 56px; border-radius: 9999px;
          background: ${GOLD};
        }
        .atlas-pulse-ring::after {
          content: "";
          position: absolute; inset: 0; border-radius: 9999px;
          border: 3px solid ${GOLD};
          animation: atlas-pulse-ring 1.6s ease-out infinite;
        }
        .atlas-welcome-cta {
          transition: transform 200ms ease, filter 200ms ease, box-shadow 200ms ease, opacity 200ms ease;
        }
        .atlas-welcome-cta:hover:not(:disabled) {
          transform: scale(1.02);
          filter: brightness(1.07);
          box-shadow: 0 10px 28px rgba(201,146,42,0.35);
        }
        .atlas-welcome-cta:disabled { opacity: 0.6; cursor: not-allowed; }
        .atlas-back-link { transition: color 150ms ease; }
        .atlas-back-link:hover { color: #fff; }
        .atlas-skip-link { transition: color 150ms ease; }
        .atlas-skip-link:hover { color: ${GOLD}; }
        .atlas-resume-drop:hover { filter: brightness(1.07); }
      `}</style>
    </div>
  );
}

function ExtractedRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex gap-2 text-white">
      <span style={{ color: GOLD }}>•</span>
      <span>
        <span className="font-semibold">{label}:</span>{" "}
        <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
      </span>
    </li>
  );
}

function FileChip({ file, onClear }: { file: File; onClear: () => void }) {
  const sizeKb = file.size / 1024;
  const sizeStr =
    sizeKb < 1024 ? `${sizeKb.toFixed(0)} KB` : `${(sizeKb / 1024).toFixed(1)} MB`;
  return (
    <div
      className="w-full rounded-xl flex items-center gap-3 px-4 py-4"
      style={{
        background: NAVY,
        border: `1px solid ${GOLD}`,
      }}
    >
      <FileText size={28} color={GOLD} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {file.name}
        </div>
        <div
          className="text-[11px] sm:text-xs"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          {sizeStr}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-1 hover:bg-white/10"
        aria-label="Remove file"
      >
        <X size={18} color={GOLD} />
      </button>
    </div>
  );
}

function revealStyle(mounted: boolean, delayMs: number): React.CSSProperties {
  return mounted
    ? {
        animation: `atlas-step-reveal 400ms ease-out both`,
        animationDelay: `${delayMs}ms`,
      }
    : { opacity: 0, transform: "translateY(14px)" };
}
