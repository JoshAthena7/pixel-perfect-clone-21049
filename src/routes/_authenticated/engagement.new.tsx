import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useIsAdmin } from "@/hooks/use-admin";
import { useSession } from "@/hooks/use-session";
import { ChevronLeft, Plus, X, ShieldCheck, ArrowRight, Link as LinkIcon, Sparkles, FileText, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/engagement/new")({
  head: () => ({ meta: [{ title: "New Engagement — Athena" }] }),
  component: NewEngagementPage,
});

// ───── design tokens (match lobby) ─────
const BG = "#0d0d14";
const CARD = "#16161f";
const CARD_HOVER = "#1c1c27";
const BORDER = "rgba(255,255,255,0.06)";
const BORDER_STRONG = "rgba(255,255,255,0.12)";
const GOLD = "#c9b370";
const TEAL = "#5fb8a8";

const ENGAGEMENT_TYPES = ["RFP", "Sole Source", "Recompete", "Task Order"] as const;
const STEPS = ["Identity", "Intelligence", "Team"] as const;

type StateRow = { state: string; state_name: string; procurement_portal_url: string | null; small_business_program: string | null };
type TriviaRow = { id: string; question: string; choices: string[]; correct_index: number };

type Invitee = { display_name: string; email: string; role: string; title: string };

function NewEngagementPage() {
  const { user } = useSession();
  const { memberships, refresh, switchEngagement, loading: memLoading } = useEngagement();
  const navigate = useNavigate();

  // access gate — platform admins (Executives) and engagement leadership can create new engagements
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const isAllowed = useMemo(() => {
    if (memLoading || adminLoading) return null;
    if (isAdmin) return true;
    if (memberships.length === 0) return true; // first-ever engagement
    return memberships.some((m) => m.role === "founder" || m.role === "pm" || m.role === "engagement_lead");
  }, [memberships, memLoading, isAdmin, adminLoading]);

  useEffect(() => {
    if (isAllowed === false) navigate({ to: "/select-engagement", replace: true });
  }, [isAllowed, navigate]);

  const [step, setStep] = useState(0);
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Step 1 — Identity
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [market, setMarket] = useState("");
  const [submissionDate, setSubmissionDate] = useState("");
  const [engagementType, setEngagementType] = useState<typeof ENGAGEMENT_TYPES[number] | "">("");
  const [contractValue, setContractValue] = useState("");

  // RFP doc (uploaded as part of step 1)
  const [rfpFile, setRfpFile] = useState<File | null>(null);
  const [rfpPlaceholder, setRfpPlaceholder] = useState(false);

  // State preview
  const [states, setStates] = useState<StateRow[]>([]);
  const [stateInfo, setStateInfo] = useState<StateRow | null>(null);
  const [trivia, setTrivia] = useState<TriviaRow[]>([]);

  useEffect(() => {
    supabase.from("state_resources").select("state, state_name, procurement_portal_url, small_business_program").order("state_name")
      .then(({ data }) => setStates((data as StateRow[]) ?? []));
  }, []);

  useEffect(() => {
    if (!stateCode) { setStateInfo(null); setTrivia([]); return; }
    setStateInfo(states.find((s) => s.state === stateCode) ?? null);
    supabase.from("state_trivia_bank").select("id, question, choices, correct_index").eq("state", stateCode).limit(3)
      .then(({ data }) => setTrivia((data as TriviaRow[]) ?? []));
  }, [stateCode, states]);

  // Step 2 — Intelligence
  const [incumbent, setIncumbent] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [evalCriteria, setEvalCriteria] = useState<string[]>([]);
  const [differentiators, setDifferentiators] = useState<string[]>([]);
  const [localRequirements, setLocalRequirements] = useState("");
  const [stateNotes, setStateNotes] = useState("");

  // Step 3 — Team
  const [invitees, setInvitees] = useState<Invitee[]>([
    { display_name: "", email: "", role: "engagement_lead", title: "" },
  ]);

  // ─── actions ───
  async function submitStep1() {
    if (!user) return;
    if (!name.trim() || !client.trim()) {
      toast.error("Engagement name and client are required.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("engagements")
        .insert({
          name: name.trim(),
          client: client.trim(),
          state: stateCode || null,
          market: market.trim() || null,
          engagement_type: engagementType || null,
          contract_value_estimate: contractValue ? Number(contractValue) : null,
          submission_date: submissionDate || null,
          created_by: user.id,
          status: "Active",
        })
        .select()
        .single();
      if (error) throw error;
      setEngagementId(data.id);

      // Pre-seed config with state notes if any
      if (stateInfo?.small_business_program || stateInfo?.procurement_portal_url) {
        const preNote = [
          stateInfo.procurement_portal_url ? `Procurement portal: ${stateInfo.procurement_portal_url}` : "",
          stateInfo.small_business_program ? `Small business program: ${stateInfo.small_business_program}` : "",
        ].filter(Boolean).join("\n");
        await supabase.from("engagement_config")
          .update({ state_specific_notes: preNote })
          .eq("engagement_id", data.id);
        setStateNotes(preNote);
      }

      // RFP: either upload the real file, or drop a placeholder row
      try {
        if (rfpFile) {
          const safeName = rfpFile.name.replace(/[^\w.\-]+/g, "_");
          const path = `${data.id}/rfp/${Date.now()}_${safeName}`;
          const up = await supabase.storage.from("intel-files").upload(path, rfpFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: rfpFile.type || undefined,
          });
          if (up.error) throw up.error;
          await supabase.from("intel_documents").insert({
            engagement_id: data.id,
            name: rfpFile.name,
            category: "RFP",
            file_path: path,
            uploaded_by: user.id,
            notes: "Primary RFP document — uploaded during engagement setup.",
          });
          toast.success("RFP uploaded.");
        } else if (rfpPlaceholder) {
          await supabase.from("intel_documents").insert({
            engagement_id: data.id,
            name: "RFP — placeholder",
            category: "RFP",
            notes: "Placeholder — replace with the real RFP when available.",
            uploaded_by: user.id,
          });
        }
      } catch (rfpErr: any) {
        console.error(rfpErr);
        toast.error(`Engagement created, but RFP upload failed: ${rfpErr.message ?? "unknown error"}`);
      }

      await refresh();
      setStep(1);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Could not create engagement.");
    } finally {
      setSaving(false);
    }
  }

  async function submitStep2() {
    if (!engagementId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("engagement_config")
        .update({
          incumbent: incumbent.trim() || null,
          competitors,
          evaluation_criteria: evalCriteria,
          key_differentiators: differentiators,
          local_requirements: localRequirements.trim() || null,
          state_specific_notes: stateNotes.trim() || null,
        })
        .eq("engagement_id", engagementId);
      if (error) throw error;
      setStep(2);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Could not save intelligence.");
    } finally {
      setSaving(false);
    }
  }

  async function submitStep3AndOpen() {
    if (!engagementId || !user) return;
    setSaving(true);
    try {
      const profile = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
      const inviterName = profile.data?.display_name ?? user.email ?? "Founder";

      const validInvites = invitees.filter((i) => i.email.trim() && i.display_name.trim());
      if (validInvites.length > 0) {
        const rows = validInvites.map((i) => ({
          engagement_id: engagementId,
          email: i.email.trim().toLowerCase(),
          display_name: i.display_name.trim(),
          role: i.role,
          title: i.title.trim() || null,
          invited_by: user.id,
          invited_by_name: inviterName,
        }));
        const { error } = await supabase.from("engagement_invites").insert(rows);
        if (error) throw error;
        toast.success(`${rows.length} invite${rows.length === 1 ? "" : "s"} queued.`);
      }
      switchEngagement(engagementId);
      navigate({ to: "/command", replace: true });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Could not send invites.");
    } finally {
      setSaving(false);
    }
  }

  function skipToOpen() {
    if (!engagementId) return;
    switchEngagement(engagementId);
    navigate({ to: "/command", replace: true });
  }

  if (isAllowed === null) {
    return <div className="flex min-h-screen items-center justify-center text-xs uppercase tracking-[0.3em] text-zinc-500" style={{ background: BG }}>Verifying clearance…</div>;
  }
  if (!isAllowed) return null;

  return (
    <div className="min-h-screen text-zinc-200" style={{ background: BG }}>
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <Link to="/select-engagement" className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200">
          <ChevronLeft className="h-3 w-3" /> Back to Lobby
        </Link>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: GOLD }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
            New Engagement · Restricted
          </span>
        </div>
      </header>

      {/* PROGRESS */}
      <div className="px-6 py-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <div key={label} className="flex flex-1 items-center gap-3">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    background: done ? GOLD : current ? "rgba(201,179,112,0.15)" : CARD,
                    color: done ? "#0d0d14" : current ? GOLD : "#666",
                    border: `1px solid ${current || done ? GOLD : BORDER_STRONG}`,
                  }}
                >
                  {done ? "✓" : i + 1}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: current ? GOLD : done ? "#999" : "#555" }}>
                  {label}
                </div>
                {i < STEPS.length - 1 && <div className="h-px flex-1" style={{ background: done ? GOLD : BORDER_STRONG }} />}
              </div>
            );
          })}
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {step === 0 && (
          <Step1
            name={name} setName={setName}
            client={client} setClient={setClient}
            stateCode={stateCode} setStateCode={setStateCode}
            market={market} setMarket={setMarket}
            submissionDate={submissionDate} setSubmissionDate={setSubmissionDate}
            engagementType={engagementType} setEngagementType={setEngagementType}
            contractValue={contractValue} setContractValue={setContractValue}
            states={states} stateInfo={stateInfo} trivia={trivia}
            onNext={submitStep1} saving={saving}
          />
        )}
        {step === 1 && (
          <Step2
            incumbent={incumbent} setIncumbent={setIncumbent}
            competitors={competitors} setCompetitors={setCompetitors}
            evalCriteria={evalCriteria} setEvalCriteria={setEvalCriteria}
            differentiators={differentiators} setDifferentiators={setDifferentiators}
            localRequirements={localRequirements} setLocalRequirements={setLocalRequirements}
            stateNotes={stateNotes} setStateNotes={setStateNotes}
            onNext={submitStep2} onSkip={() => setStep(2)} saving={saving}
          />
        )}
        {step === 2 && (
          <Step3
            invitees={invitees} setInvitees={setInvitees}
            onOpen={submitStep3AndOpen} onSkip={skipToOpen} saving={saving}
          />
        )}
      </main>
    </div>
  );
}

// ───── Step 1 ─────
function Step1(p: {
  name: string; setName: (v: string) => void;
  client: string; setClient: (v: string) => void;
  stateCode: string; setStateCode: (v: string) => void;
  market: string; setMarket: (v: string) => void;
  submissionDate: string; setSubmissionDate: (v: string) => void;
  engagementType: string; setEngagementType: (v: any) => void;
  contractValue: string; setContractValue: (v: string) => void;
  states: StateRow[]; stateInfo: StateRow | null; trivia: TriviaRow[];
  onNext: () => void; saving: boolean;
}) {
  return (
    <section className="space-y-5">
      <Header title="Identity" subtitle="The basics that define this engagement and unlock its file." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Engagement Name" required>
          <Input value={p.name} onChange={p.setName} placeholder="e.g. Texas STAR+PLUS 2027" autoFocus />
        </Field>
        <Field label="Client Agency" required>
          <Input value={p.client} onChange={p.setClient} placeholder="e.g. Texas HHSC" />
        </Field>
        <Field label="State">
          <Select value={p.stateCode} onChange={p.setStateCode}>
            <option value="">Select state…</option>
            {p.states.map((s) => (
              <option key={s.state} value={s.state}>{s.state_name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Market / Region">
          <Input value={p.market} onChange={p.setMarket} placeholder="e.g. North TX SDA" />
        </Field>
        <Field label="Engagement Type">
          <Select value={p.engagementType} onChange={p.setEngagementType}>
            <option value="">Select type…</option>
            {ENGAGEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Submission Date">
          <Input type="date" value={p.submissionDate} onChange={p.setSubmissionDate} />
        </Field>
        <Field label="Contract Value Estimate (USD)">
          <Input type="number" value={p.contractValue} onChange={p.setContractValue} placeholder="0" />
        </Field>
      </div>

      {/* State preview card */}
      {p.stateCode && (p.stateInfo || p.trivia.length > 0) && (
        <div className="rounded-lg p-4" style={{ background: CARD, border: `1px solid ${BORDER_STRONG}` }}>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: GOLD }}>
            <Sparkles className="h-3 w-3" /> Athena Pre-Loaded Intel · {p.stateInfo?.state_name ?? p.stateCode}
          </div>
          <div className="grid gap-3 text-[12px] md:grid-cols-2">
            {p.stateInfo?.procurement_portal_url && (
              <a href={p.stateInfo.procurement_portal_url} target="_blank" rel="noreferrer"
                 className="flex items-start gap-2 rounded p-2 text-zinc-300 hover:text-zinc-100"
                 style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}>
                <LinkIcon className="mt-0.5 h-3 w-3 shrink-0" style={{ color: TEAL }} />
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">Procurement Portal</div>
                  <div className="truncate">{p.stateInfo.procurement_portal_url}</div>
                </div>
              </a>
            )}
            {p.stateInfo?.small_business_program && (
              <div className="flex items-start gap-2 rounded p-2 text-zinc-300"
                   style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}>
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" style={{ color: TEAL }} />
                <div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">Small Business Program</div>
                  <div>{p.stateInfo.small_business_program}</div>
                </div>
              </div>
            )}
          </div>
          {p.trivia.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                Sample Trivia ({p.trivia.length} of many) — will seed the writer huddle
              </div>
              <ul className="space-y-1.5 text-[11px] text-zinc-400">
                {p.trivia.map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <span style={{ color: GOLD }}>›</span>
                    <span>{t.question}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Footer>
        <PrimaryButton onClick={p.onNext} loading={p.saving}>
          Next: Intelligence <ArrowRight className="h-3.5 w-3.5" />
        </PrimaryButton>
      </Footer>
    </section>
  );
}

// ───── Step 2 ─────
function Step2(p: {
  incumbent: string; setIncumbent: (v: string) => void;
  competitors: string[]; setCompetitors: (v: string[]) => void;
  evalCriteria: string[]; setEvalCriteria: (v: string[]) => void;
  differentiators: string[]; setDifferentiators: (v: string[]) => void;
  localRequirements: string; setLocalRequirements: (v: string) => void;
  stateNotes: string; setStateNotes: (v: string) => void;
  onNext: () => void; onSkip: () => void; saving: boolean;
}) {
  return (
    <section className="space-y-5">
      <Header title="Intelligence" subtitle="Context that shapes win themes. All fields optional — come back any time." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Incumbent"><Input value={p.incumbent} onChange={p.setIncumbent} placeholder="Who currently holds it?" /></Field>
        <Field label="Key Competitors"><TagInput values={p.competitors} onChange={p.setCompetitors} placeholder="Add competitor + Enter" /></Field>
        <Field label="Evaluation Criteria"><TagInput values={p.evalCriteria} onChange={p.setEvalCriteria} placeholder="e.g. Network Adequacy" /></Field>
        <Field label="Key Differentiators"><TagInput values={p.differentiators} onChange={p.setDifferentiators} placeholder="What makes us win" /></Field>
      </div>
      <Field label="Local Requirements"><Textarea value={p.localRequirements} onChange={p.setLocalRequirements} placeholder="State-specific mandates, certifications, partnerships…" rows={3} /></Field>
      <Field label="State-Specific Notes"><Textarea value={p.stateNotes} onChange={p.setStateNotes} placeholder="Anything Athena should remember about this jurisdiction" rows={3} /></Field>

      <Footer>
        <button onClick={p.onSkip} className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200">
          Skip for now →
        </button>
        <PrimaryButton onClick={p.onNext} loading={p.saving}>
          Next: Team <ArrowRight className="h-3.5 w-3.5" />
        </PrimaryButton>
      </Footer>
    </section>
  );
}

// ───── Step 3 ─────
function Step3(p: {
  invitees: Invitee[]; setInvitees: (v: Invitee[]) => void;
  onOpen: () => void; onSkip: () => void; saving: boolean;
}) {
  function update(idx: number, patch: Partial<Invitee>) {
    p.setInvitees(p.invitees.map((v, i) => i === idx ? { ...v, ...patch } : v));
  }
  function add() {
    p.setInvitees([...p.invitees, { display_name: "", email: "", role: "writer", title: "" }]);
  }
  function remove(idx: number) {
    p.setInvitees(p.invitees.filter((_, i) => i !== idx));
  }

  return (
    <section className="space-y-5">
      <Header title="Team" subtitle="Seed the room with founding members. At least one Engagement Lead is recommended." />

      <div className="space-y-3">
        {p.invitees.map((inv, i) => (
          <div key={i} className="rounded-lg p-4" style={{ background: CARD, border: `1px solid ${BORDER_STRONG}` }}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">Invite #{i + 1}</div>
              {p.invitees.length > 1 && (
                <button onClick={() => remove(i)} className="text-zinc-500 hover:text-zinc-200">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input value={inv.display_name} onChange={(v) => update(i, { display_name: v })} placeholder="Display name" />
              <Input value={inv.email} onChange={(v) => update(i, { email: v })} placeholder="email@firm.com" type="email" />
              <Select value={inv.role} onChange={(v) => update(i, { role: v })}>
                <option value="engagement_lead">Engagement Lead</option>
                <option value="writer">Writer</option>
                <option value="viewer">Viewer</option>
              </Select>
              <Input value={inv.title} onChange={(v) => update(i, { title: v })} placeholder="Title (optional)" />
            </div>
          </div>
        ))}
        <button
          onClick={add}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500 transition hover:text-zinc-200"
          style={{ border: `1px dashed ${BORDER_STRONG}` }}
        >
          <Plus className="h-3.5 w-3.5" /> Add another invite
        </button>
      </div>

      <Footer>
        <button onClick={p.onSkip} className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200">
          Skip & open empty room →
        </button>
        <PrimaryButton onClick={p.onOpen} loading={p.saving}>
          Open War Room <ArrowRight className="h-3.5 w-3.5" />
        </PrimaryButton>
      </Footer>
    </section>
  );
}

// ───── primitives ─────
function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-100">{title}</h1>
      <p className="mt-1 text-[12px] text-zinc-500">{subtitle}</p>
    </div>
  );
}
function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-4 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
      {children}
    </div>
  );
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
        {label}{required && <span style={{ color: GOLD }}> *</span>}
      </div>
      {children}
    </label>
  );
}
function Input({ value, onChange, placeholder, type = "text", autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--ring,#c9b370)]"
      style={{ background: CARD, border: `1px solid ${BORDER_STRONG}` }}
    />
  );
}
function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md px-3 py-2 text-sm text-zinc-100 outline-none"
      style={{ background: CARD, border: `1px solid ${BORDER_STRONG}` }}
    >
      {children}
    </select>
  );
}
function Textarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-md px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
      style={{ background: CARD, border: `1px solid ${BORDER_STRONG}` }}
    />
  );
}
function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setDraft("");
  }
  return (
    <div className="rounded-md p-2" style={{ background: CARD, border: `1px solid ${BORDER_STRONG}` }}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px]"
                style={{ background: "rgba(201,179,112,0.1)", border: `1px solid rgba(201,179,112,0.3)`, color: GOLD }}>
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="opacity-70 hover:opacity-100">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
            if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
        />
      </div>
    </div>
  );
}
function PrimaryButton({ onClick, loading, children }: { onClick: () => void; loading?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] transition disabled:opacity-50"
      style={{ background: GOLD, color: "#0d0d14" }}
      onMouseEnter={(e) => !loading && (e.currentTarget.style.background = "#d8c280")}
      onMouseLeave={(e) => !loading && (e.currentTarget.style.background = GOLD)}
    >
      {loading ? "Working…" : children}
    </button>
  );
}
