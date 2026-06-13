import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { logAuditEvent } from "@/lib/mission-audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/olympus/missions/new")({
  component: MeetIrisIntro,
});

function MeetIrisIntro() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState<string>("");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [agency, setAgency] = useState("");
  const [deadline, setDeadline] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Optional canvas fields
  const [northStar, setNorthStar] = useState("");
  const [whyWin, setWhyWin] = useState("");
  const [whyLose, setWhyLose] = useState("");
  const [biggestConcerns, setBiggestConcerns] = useState("");
  const [knownCompetitors, setKnownCompetitors] = useState("");
  const [statePriorities, setStatePriorities] = useState("");
  const [winThemesText, setWinThemesText] = useState("");
  const [reinforce, setReinforce] = useState("");
  const [avoid, setAvoid] = useState("");

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    strategy: false,
    competitive: false,
    guidance: false,
  });
  const toggleSection = (k: string) =>
    setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  const toArray = (v: string) =>
    v.split(",").map((s) => s.trim()).filter(Boolean);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", uid)
        .maybeSingle();
      const fn = (prof?.display_name || data.user?.email || "").split(/[\s@]/)[0];
      setFirstName(fn ? fn.charAt(0).toUpperCase() + fn.slice(1) : "");
    })();
  }, []);

  const valid =
    name.trim() && client.trim() && agency.trim() && deadline.trim();

  async function handleSubmit() {
    const err: Record<string, boolean> = {};
    if (!name.trim()) err.name = true;
    if (!client.trim()) err.client = true;
    if (!agency.trim()) err.agency = true;
    if (!deadline.trim()) err.deadline = true;
    if (Object.keys(err).length) {
      setErrors(err);
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const competitorsArr = toArray(knownCompetitors);
      const reinforceArr = toArray(reinforce);
      const avoidArr = toArray(avoid);
      const { data, error } = await supabase
        .from("missions")
        .insert({
          name: name.trim(),
          client_name: client.trim(),
          agency_name: agency.trim(),
          submission_deadline: new Date(deadline).toISOString(),
          status: "setup",
          created_by: uid,
          north_star: northStar.trim() || null,
          why_win: whyWin.trim() || null,
          why_lose: whyLose.trim() || null,
          biggest_concerns: biggestConcerns.trim() || null,
          known_competitors: competitorsArr.length ? competitorsArr : null,
          state_priorities: statePriorities.trim() || null,
          win_themes_text: winThemesText.trim() || null,
          reinforce: reinforceArr.length ? reinforceArr : null,
          avoid: avoidArr.length ? avoidArr : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      void logAuditEvent(data.id, "Mission created", uid, null, {
        mission_name: name.trim(),
        client_name: client.trim(),
      });
      navigate({
        to: "/olympus/missions/$missionId/wizard",
        params: { missionId: data.id },
        search: { step: 1 },
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to brief IRIS. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const greet = firstName ? `Hi ${firstName}.` : "Hi there.";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "#0A1628", color: "white" }}
    >
      <div className="w-full max-w-[640px]">
        {/* IRIS header */}
        <div className="flex items-start gap-4 mb-8">
          <div
            className="shrink-0 rounded-full flex items-center justify-center"
            style={{
              width: 56,
              height: 56,
              background: "rgba(127,119,221,0.12)",
              border: "1px solid rgba(167,139,250,0.35)",
              boxShadow: "0 0 24px rgba(167,139,250,0.25)",
            }}
          >
            <IrisMark size={32} glow />
          </div>
          <div className="pt-1">
            <div
              className="text-[11px] uppercase tracking-[0.22em]"
              style={{ color: "#C49A2B" }}
            >
              IRIS · Mission Intelligence Officer
            </div>
            <div className="text-white/55 text-[13px] mt-0.5">Online</div>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 sm:p-10"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow:
              "0 30px 80px -30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <h1 className="text-white text-[26px] sm:text-[30px] font-medium leading-snug">
            {greet} I'm <span style={{ color: "#C49A2B" }}>IRIS</span>.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/65">
            Let's set up a new mission together. Tell me the basics and I'll
            take it from there — read the RFP, map the agency, and build the
            intelligence picture before you write a word.
          </p>

          <div className="mt-8 space-y-5">
            <ChatField
              label="What should we call this mission?"
              placeholder="e.g. NJ CSOC RFP"
              value={name}
              onChange={(v) => {
                setName(v);
                if (errors.name) setErrors((e) => ({ ...e, name: false }));
              }}
              error={errors.name}
            />
            <ChatField
              label="Who's the client?"
              placeholder="Full name of the procuring entity"
              value={client}
              onChange={(v) => {
                setClient(v);
                if (errors.client) setErrors((e) => ({ ...e, client: false }));
              }}
              error={errors.client}
            />
            <ChatField
              label="Which state and agency?"
              placeholder="e.g. Texas — HHSC"
              value={agency}
              onChange={(v) => {
                setAgency(v);
                if (errors.agency) setErrors((e) => ({ ...e, agency: false }));
              }}
              error={errors.agency}
            />
            <ChatField
              label="When is it due?"
              placeholder=""
              type="datetime-local"
              value={deadline}
              onChange={(v) => {
                setDeadline(v);
                if (errors.deadline)
                  setErrors((e) => ({ ...e, deadline: false }));
              }}
              error={errors.deadline}
            />
          </div>

          <div className="mt-8 space-y-3">
            <CollapsibleSection
              title="Mission Strategy"
              subtitle="Optional — frame the bid"
              open={openSections.strategy}
              onToggle={() => toggleSection("strategy")}
            >
              <ChatField
                label="North Star"
                placeholder="What is the single most important thing we must say in this proposal?"
                value={northStar}
                onChange={setNorthStar}
                multiline
              />
              <ChatField
                label="Why We Win"
                placeholder="What unique advantages do we bring that the client actually cares about?"
                value={whyWin}
                onChange={setWhyWin}
                multiline
              />
              <ChatField
                label="Why We Could Lose"
                placeholder="What are our honest vulnerabilities on this pursuit?"
                value={whyLose}
                onChange={setWhyLose}
                multiline
              />
              <ChatField
                label="Biggest Concerns"
                placeholder="What keeps you up at night about this bid?"
                value={biggestConcerns}
                onChange={setBiggestConcerns}
                multiline
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Competitive Context"
              subtitle="Optional — who and what we're up against"
              open={openSections.competitive}
              onToggle={() => toggleSection("competitive")}
            >
              <ChatField
                label="Known Competitors"
                placeholder="Comma-separated, e.g. AmeriHealth, Centene, Molina"
                value={knownCompetitors}
                onChange={setKnownCompetitors}
              />
              <ChatField
                label="State Priorities"
                placeholder="What does this state care most about right now politically and programmatically?"
                value={statePriorities}
                onChange={setStatePriorities}
                multiline
              />
              <ChatField
                label="Win Themes"
                placeholder="What 3-5 themes should run through every section of our response?"
                value={winThemesText}
                onChange={setWinThemesText}
                multiline
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Proposal Guidance"
              subtitle="Optional — what to say and what to dodge"
              open={openSections.guidance}
              onToggle={() => toggleSection("guidance")}
            >
              <ChatField
                label="What to Reinforce"
                placeholder="Comma-separated key messages to repeat throughout the proposal"
                value={reinforce}
                onChange={setReinforce}
              />
              <ChatField
                label="What to Avoid"
                placeholder="Comma-separated topics, claims, or language to stay away from"
                value={avoid}
                onChange={setAvoid}
              />
            </CollapsibleSection>
          </div>



          <div className="mt-10 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[14px] font-medium transition-all",
                saving && "opacity-50 cursor-not-allowed",
                !valid && !saving && "opacity-70",
              )}
              style={{
                background: "#C49A2B",
                color: "#0A1628",
                boxShadow: valid
                  ? "0 8px 24px -8px rgba(196,154,43,0.55)"
                  : "none",
              }}
            >
              {saving ? "Briefing IRIS…" : "Brief IRIS →"}
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate({ to: "/olympus/missions" })}
            className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
          >
            ← Back to missions
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatField({
  label,
  placeholder,
  value,
  onChange,
  error,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] text-white/70 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg px-4 py-3 text-[15px] text-white placeholder:text-white/30 transition-colors focus:outline-none"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${error ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)"}`,
        }}
        onFocus={(e) => {
          if (!error)
            e.currentTarget.style.borderColor = "rgba(196,154,43,0.55)";
        }}
        onBlur={(e) => {
          if (!error)
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        }}
      />
    </div>
  );
}
