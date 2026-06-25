import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { QuestionResponseOutline } from "@/hooks/useQuestionOutline";

type Props = {
  outline: QuestionResponseOutline | null;
  isGlobal: boolean;
  missionId: string;
  questionId: string;
  questionNumber?: string | null;
  canEdit?: boolean;
  onSaved?: () => void;
};

export function ResponseOutlineCard({
  outline,
  isGlobal,
  missionId,
  questionId,
  questionNumber,
  canEdit = false,
  onSaved,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);

  if (!outline) {
    if (!canEdit) return null;
    return (
      <div style={{ margin: "10px 0" }}>
        {editing ? (
          <OutlineEditor
            missionId={missionId}
            questionId={questionId}
            questionNumber={questionNumber}
            initial={null}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              onSaved?.();
            }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 9,
              color: "rgba(96,165,250,0.6)",
            }}
          >
            + Add response structure for this question
          </button>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <OutlineEditor
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        initial={outline}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onSaved?.();
        }}
      />
    );
  }

  return (
    <div
      style={{
        margin: "12px 0",
        padding: "12px 16px",
        background: "rgba(96,165,250,0.04)",
        border: "1px solid rgba(96,165,250,0.15)",
        borderLeft: "3px solid rgba(96,165,250,0.5)",
        borderRadius: "0 4px 4px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: expanded ? 10 : 0,
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "rgba(96,165,250,0.8)" }}>📋</span>
          <span style={{ fontSize: 10, color: "rgba(96,165,250,0.8)", letterSpacing: "0.05em" }}>
            CLIENT RESPONSE OUTLINE
          </span>
          {isGlobal && (
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>
              (applies to all questions)
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 9,
                color: "rgba(255,255,255,0.35)",
              }}
            >
              edit
            </button>
          )}
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
            {expanded ? "▾ collapse" : "▸ show"}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {outline.section_headers?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
                REQUIRED SECTIONS (in order)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {outline.section_headers.map((header, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 9,
                        color: "rgba(255,255,255,0.25)",
                        fontFamily: "monospace",
                        minWidth: 16,
                      }}
                    >
                      {i + 1}.
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{header}</span>
                    {outline.word_allocation?.[header] && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "rgba(255,255,255,0.3)",
                          marginLeft: "auto",
                          fontFamily: "monospace",
                        }}
                      >
                        ~{outline.word_allocation[header]}w
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {outline.total_word_limit && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 3,
                width: "fit-content",
              }}
            >
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>TOTAL LIMIT</span>
              <span
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.8)",
                  fontFamily: "monospace",
                  fontWeight: 500,
                }}
              >
                {outline.total_word_limit} words
              </span>
            </div>
          )}

          {outline.content_guidance && (
            <div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>
                HOW TO APPROACH
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
                {outline.content_guidance}
              </div>
            </div>
          )}

          {outline.required_elements?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: "rgba(74,222,128,0.6)", marginBottom: 3 }}>
                MUST INCLUDE
              </div>
              {outline.required_elements.map((el, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.55)",
                    display: "flex",
                    gap: 6,
                    marginBottom: 2,
                  }}
                >
                  <span style={{ color: "rgba(74,222,128,0.6)" }}>✓</span>
                  {el}
                </div>
              ))}
            </div>
          )}

          {outline.prohibited_elements?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: "rgba(248,113,113,0.6)", marginBottom: 3 }}>
                DO NOT INCLUDE
              </div>
              {outline.prohibited_elements.map((el, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.55)",
                    display: "flex",
                    gap: 6,
                    marginBottom: 2,
                  }}
                >
                  <span style={{ color: "rgba(248,113,113,0.6)" }}>✗</span>
                  {el}
                </div>
              ))}
            </div>
          )}

          {outline.format_notes && (
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.4)",
                fontStyle: "italic",
                paddingTop: 4,
                borderTop: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              Format: {outline.format_notes}
            </div>
          )}

          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", paddingTop: 4 }}>
            Structure your response in your writing environment following this outline.
          </div>
        </div>
      )}
    </div>
  );
}

function OutlineEditor({
  missionId,
  questionId,
  questionNumber,
  initial,
  onCancel,
  onSaved,
}: {
  missionId: string;
  questionId: string;
  questionNumber?: string | null;
  initial: QuestionResponseOutline | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [headers, setHeaders] = useState(initial?.section_headers?.join("\n") ?? "");
  const [wordLimit, setWordLimit] = useState(initial?.total_word_limit?.toString() ?? "");
  const [guidance, setGuidance] = useState(initial?.content_guidance ?? "");
  const [required, setRequired] = useState(initial?.required_elements?.join("\n") ?? "");
  const [prohibited, setProhibited] = useState(initial?.prohibited_elements?.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const headerList = headers.split("\n").map((s) => s.trim()).filter(Boolean);
    const reqList = required.split("\n").map((s) => s.trim()).filter(Boolean);
    const prohList = prohibited.split("\n").map((s) => s.trim()).filter(Boolean);
    const limit = wordLimit.trim() ? Number(wordLimit) : null;

    const payload = {
      mission_id: missionId,
      question_id: questionId,
      document_id: initial?.document_id ?? null,
      section_headers: headerList,
      content_guidance: guidance.trim() || null,
      word_allocation: initial?.word_allocation ?? {},
      total_word_limit: Number.isFinite(limit) ? limit : null,
      format_notes: initial?.format_notes ?? null,
      required_elements: reqList,
      prohibited_elements: prohList,
      source_text: null,
      confidence: 1.0,
      parsed_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let err;
    if (initial?.id) {
      ({ error: err } = await sb
        .from("question_response_outlines")
        .update(payload)
        .eq("id", initial.id));
    } else {
      ({ error: err } = await sb.from("question_response_outlines").insert(payload));
    }
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved();
  };

  return (
    <div
      style={{
        margin: "12px 0",
        padding: 14,
        background: "rgba(96,165,250,0.04)",
        border: "1px solid rgba(96,165,250,0.2)",
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(96,165,250,0.9)", letterSpacing: "0.05em" }}>
        {initial ? "EDIT" : "ADD"} RESPONSE STRUCTURE
        {questionNumber ? ` — Q${questionNumber}` : ""}
      </div>
      <Field label="Section headers (one per line)">
        <textarea
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          rows={4}
          placeholder={"Executive Summary\nTechnical Approach\nPast Performance"}
          style={editorTextareaStyle}
        />
      </Field>
      <Field label="Word limit">
        <input
          type="number"
          value={wordLimit}
          onChange={(e) => setWordLimit(e.target.value)}
          placeholder="500"
          style={{ ...editorTextareaStyle, height: 28 } as React.CSSProperties}
        />
      </Field>
      <Field label="Key guidance">
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          rows={3}
          placeholder="Lead with outcomes. Reference NJ-specific data."
          style={editorTextareaStyle}
        />
      </Field>
      <Field label="Must include (one per line)">
        <textarea
          value={required}
          onChange={(e) => setRequired(e.target.value)}
          rows={3}
          style={editorTextareaStyle}
        />
      </Field>
      <Field label="Do NOT include (one per line)">
        <textarea
          value={prohibited}
          onChange={(e) => setProhibited(e.target.value)}
          rows={2}
          style={editorTextareaStyle}
        />
      </Field>
      {error && <div style={{ fontSize: 10, color: "rgb(248,113,113)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "6px 12px",
            fontSize: 11,
            background: "rgba(96,165,250,0.8)",
            color: "#000",
            border: "none",
            borderRadius: 3,
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save structure"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 12px",
            fontSize: 11,
            background: "transparent",
            color: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const editorTextareaStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 3,
  padding: "6px 8px",
  fontSize: 11,
  color: "rgba(255,255,255,0.85)",
  fontFamily: "inherit",
  resize: "vertical",
};
