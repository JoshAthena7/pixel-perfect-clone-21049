import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getEmailTemplateOverride,
  saveEmailTemplateOverride,
} from "@/lib/email-template-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/email-templates")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) throw redirect({ to: "/my-work" });
  },
  component: EmailTemplatesPage,
});

const TOKENS = [
  "{{recipientName}}",
  "{{missionName}}",
  "{{role}}",
  "{{engagementLeadName}}",
  "{{expectedStartDate}}",
  "{{clientName}}",
];

const SAMPLE: Record<string, string> = {
  recipientName: "Alex Carter",
  missionName: "NJ CSOC Cyber Defense Modernization",
  role: "Lead Writer",
  engagementLeadName: "Jordan Reyes",
  expectedStartDate: "Jun 15, 2026",
  clientName: "State of NJ",
};

const subst = (s: string) =>
  (s || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => SAMPLE[k] ?? "");

function EmailTemplatesPage() {
  const load = useServerFn(getEmailTemplateOverride);
  const save = useServerFn(saveEmailTemplateOverride);

  const [subject, setSubject] = useState("");
  const [intro, setIntro] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [signoff, setSignoff] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await load({ data: { templateKey: "mission-invite" } });
        const o = res.override || {};
        setSubject(o.subject ?? "Your Mission Awaits — {{missionName}}");
        setIntro(o.intro ?? "Hi {{recipientName}},");
        setBody(
          o.body ??
            "You've been selected to join the {{missionName}} pursuit team at Athena Strategy Command."
        );
        setCtaLabel(o.cta_label ?? "CREATE YOUR ACCOUNT →");
        setSignoff(o.signoff ?? "— Athena Strategy Command");
      } catch (e: any) {
        toast.error(e?.message || "Failed to load template");
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await save({
        data: {
          templateKey: "mission-invite",
          subject,
          intro,
          body,
          cta_label: ctaLabel,
          signoff,
        },
      });
      toast.success("Template saved");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const previewParas = useMemo(
    () =>
      subst(body)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean),
    [body]
  );

  if (loading) {
    return (
      <div style={{ padding: 32, color: "rgba(255,255,255,0.7)", background: "#080c14", minHeight: "100vh" }}>
        Loading template…
      </div>
    );
  }

  return (
    <div style={{ background: "#080c14", minHeight: "100vh", padding: "32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", color: "#E6E9EE" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#c9a84c", margin: 0 }}>
              Email Template — Mission Invite
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
              Customize the invitation IRIS sends from <code>iris@athenacommandcenter.com</code>.
            </p>
          </div>
          <Link to="/_authenticated/admin" style={{ fontSize: 12, color: "#c9a84c", textDecoration: "none" }}>
            ← Back to Admin
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Editor */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: 20 }}>
            <Field label="Subject line">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Greeting / intro">
              <input value={intro} onChange={(e) => setIntro(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Body (blank line = new paragraph)">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
              />
            </Field>
            <Field label="CTA button label">
              <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Sign-off">
              <input value={signoff} onChange={(e) => setSignoff(e.target.value)} style={inputStyle} />
            </Field>

            <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              <div style={{ marginBottom: 6, letterSpacing: "0.12em", textTransform: "uppercase", color: "#c9a84c" }}>
                Available tokens
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TOKENS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(t);
                      toast.success(`Copied ${t}`);
                    }}
                    style={tokenChip}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              <button onClick={onSave} disabled={saving} style={primaryBtn}>
                {saving ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 8 }}>
              Live preview (sample data)
            </div>
            <div style={{ background: "#fff", padding: 24, borderRadius: 6 }}>
              <div
                style={{
                  maxWidth: 560,
                  margin: "0 auto",
                  padding: "32px 28px 48px",
                  background: "#0B0F14",
                  color: "#E6E9EE",
                  borderRadius: 4,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                }}
              >
                <div style={{ paddingBottom: 24, borderBottom: "1px solid rgba(201,146,42,0.25)" }}>
                  <div style={{ color: "#C9922A", letterSpacing: "0.28em", fontSize: 11, fontWeight: 700 }}>
                    ATHENA STRATEGY COMMAND
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 16 }}>
                  <strong style={{ color: "#fff" }}>Subject:</strong> {subst(subject)}
                </div>
                <h2 style={{ marginTop: 24, fontSize: 28, color: "#fff", fontWeight: 600 }}>Your Mission Awaits</h2>
                <div style={{ color: "#C9922A", fontSize: 15, marginBottom: 20 }}>{SAMPLE.missionName}</div>
                <div style={{ fontSize: 15, marginBottom: 14 }}>{subst(intro)}</div>
                {previewParas.map((p, i) => (
                  <div key={i} style={{ fontSize: 14, lineHeight: 1.65, color: "#C3C8D1", marginBottom: 12 }}>
                    {p}
                  </div>
                ))}
                <div
                  style={{
                    margin: "20px 0",
                    padding: "16px 18px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                >
                  <div><span style={{ color: "#9CA3AF" }}>Role:</span> {SAMPLE.role}</div>
                  <div><span style={{ color: "#9CA3AF" }}>Engagement Lead:</span> {SAMPLE.engagementLeadName}</div>
                  <div><span style={{ color: "#9CA3AF" }}>Expected Start:</span> {SAMPLE.expectedStartDate}</div>
                </div>
                <div style={{ textAlign: "center", margin: "24px 0" }}>
                  <span
                    style={{
                      display: "inline-block",
                      background: "#C9922A",
                      color: "#0B0F14",
                      padding: "12px 28px",
                      borderRadius: 3,
                      fontWeight: 700,
                      letterSpacing: "0.22em",
                      fontSize: 12,
                    }}
                  >
                    {ctaLabel}
                  </span>
                </div>
                <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "24px 0 16px" }} />
                <div style={{ fontSize: 13, color: "#C3C8D1", fontStyle: "italic" }}>{signoff}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(0,0,0,0.4)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4,
  color: "#E6E9EE",
  padding: "10px 12px",
  fontSize: 13,
  outline: "none",
};

const tokenChip: React.CSSProperties = {
  background: "rgba(201,146,42,0.12)",
  border: "1px solid rgba(201,146,42,0.3)",
  color: "#c9a84c",
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "ui-monospace, monospace",
};

const primaryBtn: React.CSSProperties = {
  background: "#C9922A",
  color: "#0B0F14",
  border: "none",
  padding: "10px 20px",
  borderRadius: 3,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.18em",
  cursor: "pointer",
};
