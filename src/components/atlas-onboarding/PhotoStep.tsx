import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  completeAtlasPhotoStep,
  getAtlasOnboardingMemberId,
  skipAtlasPhotoStep,
} from "@/lib/atlas-onboarding-uploads.functions";

const GOLD = "#C9922A";
const NAVY = "#0D1B3E";
const AMBER = "#F5B845";

const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_TTL = 60 * 60 * 24 * 365 * 5; // 5 years

type Props = {
  onAdvanced: () => void;
  onBack: () => void;
};

export function PhotoStep({ onAdvanced, onBack }: Props) {
  const completeFn = useServerFn(completeAtlasPhotoStep);
  const skipFn = useServerFn(skipAtlasPhotoStep);
  const memberIdFn = useServerFn(getAtlasOnboardingMemberId);

  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSkipPrompt, setShowSkipPrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadZoneRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 16);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = useCallback((f: File | null) => {
    setError(null);
    if (!f) return;
    if (!ACCEPTED_MIME.includes(f.type)) {
      setError(
        "That file type isn't supported. Please upload a JPG, PNG, or WebP image.",
      );
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That photo is too large. Please upload an image under 5MB.");
      return;
    }
    setFile(f);
  }, []);

  async function handleUseThisPhoto() {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { memberId } = await memberIdFn();
      const ext =
        file.name.split(".").pop()?.toLowerCase() ||
        (file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : file.type === "image/gif"
              ? "gif"
              : "jpg");
      const path = `${memberId}-avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("atlas-avatars")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });
      if (upErr) throw new Error(upErr.message);

      // Bucket is private; create a long-lived signed URL.
      const { data: signed, error: sErr } = await supabase.storage
        .from("atlas-avatars")
        .createSignedUrl(path, SIGNED_TTL);
      if (sErr || !signed?.signedUrl) {
        throw new Error(sErr?.message ?? "Could not generate avatar URL.");
      }
      await completeFn({ data: { avatarUrl: signed.signedUrl } });
      onAdvanced();
    } catch (e: any) {
      console.error("[atlas-onboarding] photo upload failed", e);
      setError(
        e?.message ??
          "Something went wrong uploading your photo. Please try again.",
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
      console.error("[atlas-onboarding] photo skip failed", e);
      setError(e?.message ?? "Couldn't continue. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="relative w-full flex justify-center">
      <div className="w-full max-w-[520px] px-4">
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
          Step 3 of 5
        </div>
        <h1
          className="mt-3 text-3xl sm:text-4xl font-semibold text-white"
          style={revealStyle(mounted, 200)}
        >
          Put a face to the name.
        </h1>
        <p
          className="mt-4 text-sm sm:text-base"
          style={{
            color: "rgba(255,255,255,0.7)",
            ...revealStyle(mounted, 400),
          }}
        >
          Your photo shows up on every mission you're assigned to. Make it a
          good one.
        </p>

        {/* Upload zone */}
        <div
          className="mt-10 flex flex-col items-center"
          style={revealStyle(mounted, 600)}
        >
          <button
            ref={uploadZoneRef}
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
              const f = e.dataTransfer.files?.[0] ?? null;
              handleFile(f);
            }}
            className="atlas-photo-zone relative flex items-center justify-center overflow-hidden"
            style={{
              width: "clamp(140px, 35vw, 160px)",
              height: "clamp(140px, 35vw, 160px)",
              borderRadius: 9999,
              background: NAVY,
              border: previewUrl
                ? `2px solid ${GOLD}`
                : `2px dashed ${dragging ? GOLD : "rgba(201,146,42,0.55)"}`,
              boxShadow: dragging
                ? `0 0 0 6px rgba(201,146,42,0.18)`
                : undefined,
              transition: "all 180ms ease",
            }}
            aria-label="Upload profile photo"
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Profile preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <Camera size={36} color={GOLD} />
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_MIME.join(",")}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          {file && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                inputRef.current?.click();
              }}
              className="mt-3 text-xs sm:text-sm font-medium underline-offset-2 hover:underline"
              style={{ color: GOLD }}
            >
              Change photo
            </button>
          )}

          <p
            className="mt-4 text-[11px] sm:text-xs"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            JPG, PNG or WebP · Max 5MB
          </p>

          {error && (
            <p
              className="mt-3 text-xs sm:text-sm text-center max-w-xs"
              style={{ color: AMBER }}
            >
              {error}
            </p>
          )}
        </div>

        {/* CTAs */}
        <div
          className="mt-8 flex flex-col items-center gap-3"
          style={revealStyle(mounted, 800)}
        >
          {file && (
            <button
              type="button"
              onClick={handleUseThisPhoto}
              disabled={submitting}
              className="atlas-welcome-cta inline-flex items-center justify-center gap-2 rounded-xl font-bold px-8 py-3.5 text-base w-4/5 sm:w-auto"
              style={{
                background: GOLD,
                color: NAVY,
                boxShadow: "0 8px 24px rgba(201,146,42,0.25)",
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Use this photo <span aria-hidden>→</span>
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
                No photo means no face on your missions. You can add one later
                from your profile.
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
                      () => uploadZoneRef.current?.focus(),
                      0,
                    );
                  }}
                  className="text-xs sm:text-sm font-semibold underline underline-offset-4"
                  style={{ color: GOLD }}
                >
                  Add a photo
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
        @keyframes atlas-photo-pop {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
        .atlas-photo-zone { animation: atlas-photo-pop 400ms ease-out both; animation-delay: 800ms; }
        .atlas-photo-zone:hover { filter: brightness(1.07); }
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
      `}</style>
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
