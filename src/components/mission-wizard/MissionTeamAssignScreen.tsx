import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Search, Users, ShieldCheck, Building2, Eye, PenTool, AlertTriangle, X, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { cn } from "@/lib/utils";

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_color: string | null;
  expertise_areas?: string[] | null;
};

type Bucket = {
  key: string;
  label: string;
  role: string;     // value stored in mission_team_members.mission_role
  icon: LucideIcon;
  required: boolean; // shows red if empty
};

const BUCKETS: Bucket[] = [
  { key: "writers",     label: "Writers",       role: "writer",       icon: PenTool,     required: true  },
  { key: "client_sme",  label: "Client SMEs",   role: "client_sme",   icon: Building2,   required: true  },
  { key: "athena_sme",  label: "Athena SMEs",   role: "athena_sme",   icon: ShieldCheck, required: true  },
  { key: "reviewers",   label: "Reviewers",     role: "reviewer",     icon: Eye,         required: false },
  { key: "copy_editor", label: "Copy Editors",  role: "copy_editor",  icon: Users,       required: false },
];

type Assignment = { id: string; member_id: string; mission_role: string };

export function MissionTeamAssignScreen({
  missionId,
  onContinue,
}: {
  missionId: string;
  onContinue: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "upload" | "manual">("choose");
  const [staff, setStaff] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [search, setSearch] = useState("");
  const [dragMember, setDragMember] = useState<string | null>(null);
  const [hoverBucket, setHoverBucket] = useState<string | null>(null);
  const [questionsCount, setQuestionsCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [profilesRes, teamRes, qRes, assignedRes] = await Promise.all([
        supabase.from("profiles").select("id,display_name,email,avatar_color,expertise_areas").order("display_name").limit(200),
        supabase.from("mission_team_members").select("id,member_id,mission_role").eq("mission_id", missionId),
        supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_assignments").select("question_id").eq("mission_id", missionId).not("assigned_writer_id", "is", null),
      ]);
      setStaff((profilesRes.data ?? []) as Profile[]);
      setAssignments((teamRes.data ?? []) as Assignment[]);
      setQuestionsCount(qRes.count ?? 0);
      setAssignedCount(new Set((assignedRes.data ?? []).map((r: { question_id: string }) => r.question_id)).size);
    })();
  }, [missionId]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.member_id)), [assignments]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((p) => {
      if (!q) return true;
      return (p.display_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q);
    });
  }, [staff, search]);

  const byBucket = useMemo(() => {
    const out: Record<string, Assignment[]> = {};
    BUCKETS.forEach((b) => (out[b.key] = []));
    assignments.forEach((a) => {
      const b = BUCKETS.find((x) => x.role === a.mission_role);
      if (b) out[b.key].push(a);
    });
    return out;
  }, [assignments]);

  const handleDrop = async (bucket: Bucket) => {
    const memberId = dragMember;
    setDragMember(null);
    setHoverBucket(null);
    if (!memberId) return;
    if (assignments.some((a) => a.member_id === memberId && a.mission_role === bucket.role)) return;
    const optimistic: Assignment = { id: `tmp-${Date.now()}`, member_id: memberId, mission_role: bucket.role };
    setAssignments((prev) => [...prev, optimistic]);
    const { data, error } = await supabase
      .from("mission_team_members")
      .insert({ mission_id: missionId, member_id: memberId, mission_role: bucket.role })
      .select("id,member_id,mission_role")
      .single();
    if (error || !data) {
      setAssignments((prev) => prev.filter((a) => a.id !== optimistic.id));
      return;
    }
    setAssignments((prev) => prev.map((a) => (a.id === optimistic.id ? (data as Assignment) : a)));
  };

  const removeAssignment = async (a: Assignment) => {
    setAssignments((prev) => prev.filter((x) => x.id !== a.id));
    if (!a.id.startsWith("tmp-")) {
      await supabase.from("mission_team_members").delete().eq("id", a.id);
    }
  };

  const handleSpreadsheet = async (file: File) => {
    setUploadStatus(`Reading ${file.name}…`);
    try {
      const path = `${missionId}/assignments/${Date.now()}-${file.name}`;
      await supabase.storage.from("atlas-rfp-documents").upload(path, file, { upsert: false });
      setUploadStatus("IRIS is reconciling names to staff and roles…");
      // Best-effort kick to an existing extractor; ignore failure.
      void supabase.functions.invoke("extract-assignment-sheet", { body: { missionId, path } }).catch(() => undefined);
      setTimeout(() => {
        setUploadStatus("Done. Review the auto-mapped assignments below.");
        setMode("manual");
      }, 1400);
    } catch {
      setUploadStatus("Could not read that file. Try the manual path below.");
    }
  };

  const coveragePct = questionsCount > 0 ? Math.round((assignedCount / questionsCount) * 100) : 0;

  const gaps: { text: string; tone: "amber" | "red" }[] = [];
  BUCKETS.forEach((b) => {
    if (byBucket[b.key].length === 0) {
      gaps.push({ text: `No ${b.label} assigned`, tone: b.required ? "red" : "amber" });
    }
  });
  if (questionsCount > 0 && assignedCount < questionsCount) {
    gaps.push({ text: `${questionsCount - assignedCount} questions still need a writer`, tone: "amber" });
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A1628", color: "#E8EEF7" }}>
      {/* Header */}
      <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-white/5">
        <IrisMark size={36} />
        <div className="flex-1">
          <div className="text-[12px] uppercase tracking-[0.14em]" style={{ color: "#C49A2B" }}>IRIS</div>
          <div className="text-[15px] text-white/90 mt-1 max-w-[680px] leading-relaxed">
            {mode === "choose"
              ? "Let's get the right people on this. Upload your assignment spreadsheet and I'll map it — or build the team manually."
              : "I've reconciled your assignments. Here's what still needs coverage."}
          </div>
        </div>
        <button
          onClick={onContinue}
          className="text-[13px] px-4 py-2 rounded-md transition hover:opacity-90"
          style={{ background: assignments.length ? "#C49A2B" : "transparent", color: assignments.length ? "#0D1B3E" : "#9AA7BD", border: assignments.length ? "none" : "1px solid rgba(255,255,255,0.18)" }}
        >
          {assignments.length ? "Continue →" : "Skip →"}
        </button>
      </div>

      {/* Choose mode */}
      {mode === "choose" && (
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="grid md:grid-cols-2 gap-5 w-full max-w-[820px]">
            <button
              onClick={() => fileRef.current?.click()}
              className="text-left rounded-2xl p-6 transition hover:opacity-95"
              style={{ background: "#0F1E36", border: "1px solid rgba(196,154,43,0.30)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Upload className="h-4 w-4" style={{ color: "#C49A2B" }} />
                <div className="text-[12px] uppercase tracking-wider" style={{ color: "#C49A2B" }}>Path 1</div>
              </div>
              <div className="text-[17px] font-medium text-white mb-1.5">Upload assignment spreadsheet</div>
              <div className="text-[13px] text-white/55 leading-relaxed">
                Drop an Excel, CSV, or Google Sheet export. IRIS auto-maps names to staff and roles, then matches questions to writers.
              </div>
            </button>

            <button
              onClick={() => setMode("manual")}
              className="text-left rounded-2xl p-6 transition hover:opacity-95"
              style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-white/70" />
                <div className="text-[12px] uppercase tracking-wider text-white/70">Path 2</div>
              </div>
              <div className="text-[17px] font-medium text-white mb-1.5">Build the team manually</div>
              <div className="text-[13px] text-white/55 leading-relaxed">
                Search staff by name. Drag into role buckets — Writers, Client SMEs, Athena SMEs, Reviewers, Copy Editors.
              </div>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.numbers"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleSpreadsheet(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {mode === "manual" && (
        <div className="flex-1 grid lg:grid-cols-[320px_1fr] gap-6 px-6 py-6 min-h-0">
          {/* Staff list */}
          <div className="rounded-xl flex flex-col min-h-0" style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="p-3 border-b border-white/5">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Search className="h-4 w-4 text-white/40" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search staff by name…"
                  className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-white/35"
                />
              </div>
              <div className="mt-2 text-[11px] text-white/40 px-1">Drag a person into a role bucket →</div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredStaff.length === 0 && (
                <div className="text-center text-white/35 text-[12px] py-8">No matches.</div>
              )}
              {filteredStaff.map((p) => {
                const initials = (p.display_name ?? p.email ?? "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
                const isAssigned = assignedIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => setDragMember(p.id)}
                    onDragEnd={() => { setDragMember(null); setHoverBucket(null); }}
                    className={cn(
                      "flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing transition",
                      "hover:bg-white/5",
                      dragMember === p.id && "opacity-60"
                    )}
                  >
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0"
                      style={{ background: p.avatar_color ?? "#1B2D4F", color: "#E8EEF7" }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-white truncate">{p.display_name ?? p.email ?? "Unnamed"}</div>
                      {p.expertise_areas && p.expertise_areas.length > 0 && (
                        <div className="text-[10.5px] text-white/40 truncate">{p.expertise_areas.slice(0, 2).join(" · ")}</div>
                      )}
                    </div>
                    {isAssigned && (
                      <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#7BC47F" }} title="Already assigned" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col min-h-0 gap-4">
            {/* Coverage + gaps */}
            <div className="rounded-xl p-4" style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] uppercase tracking-wider text-white/55">Question Coverage</div>
                <div className="text-[13px] font-medium" style={{ color: coveragePct >= 100 ? "#7BC47F" : "#C49A2B" }}>
                  {assignedCount} of {questionsCount} questions assigned
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full transition-all"
                  style={{ width: `${Math.min(100, coveragePct)}%`, background: coveragePct >= 100 ? "#7BC47F" : "#C49A2B" }}
                />
              </div>
              {gaps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {gaps.map((g, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                      style={{
                        background: g.tone === "red" ? "rgba(229,115,115,0.10)" : "rgba(196,154,43,0.10)",
                        color: g.tone === "red" ? "#F2A6A6" : "#E8C26B",
                        border: `1px solid ${g.tone === "red" ? "rgba(229,115,115,0.30)" : "rgba(196,154,43,0.30)"}`,
                      }}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {g.text}
                    </span>
                  ))}
                </div>
              )}
              {uploadStatus && (
                <div className="mt-3 text-[12px] text-white/60 flex items-center gap-2">
                  <Sparkles className="h-3 w-3" style={{ color: "#C49A2B" }} />
                  {uploadStatus}
                </div>
              )}
            </div>

            {/* Buckets */}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 flex-1 overflow-y-auto pr-1">
              {BUCKETS.map((b) => {
                const list = byBucket[b.key];
                const empty = list.length === 0;
                const tone = empty ? (b.required ? "red" : "amber") : "ok";
                const border =
                  hoverBucket === b.key ? "rgba(196,154,43,0.7)"
                  : tone === "red" ? "rgba(229,115,115,0.40)"
                  : tone === "amber" ? "rgba(196,154,43,0.30)"
                  : "rgba(255,255,255,0.10)";
                return (
                  <div
                    key={b.key}
                    onDragOver={(e) => { e.preventDefault(); setHoverBucket(b.key); }}
                    onDragLeave={() => setHoverBucket((h) => (h === b.key ? null : h))}
                    onDrop={() => handleDrop(b)}
                    className="rounded-xl p-3 flex flex-col min-h-[150px] transition"
                    style={{ background: "#0F1E36", border: `1px solid ${border}` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <b.icon className="h-4 w-4" style={{ color: empty && b.required ? "#F2A6A6" : "#C49A2B" }} />
                        <div className="text-[13px] font-medium text-white">{b.label}</div>
                      </div>
                      <div className="text-[11px] text-white/45">{list.length}</div>
                    </div>
                    {empty ? (
                      <div
                        className="flex-1 flex items-center justify-center text-center rounded-lg text-[11.5px]"
                        style={{
                          border: "1px dashed rgba(255,255,255,0.10)",
                          color: tone === "red" ? "#F2A6A6" : "#E8C26B",
                          background: hoverBucket === b.key ? "rgba(196,154,43,0.06)" : "transparent",
                        }}
                      >
                        {b.required ? "Required · drag a person here" : "Drag a person here"}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((a) => {
                          const p = staff.find((s) => s.id === a.member_id);
                          const name = p?.display_name ?? p?.email ?? "Unknown";
                          const initials = name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
                          return (
                            <div
                              key={a.id}
                              className="group flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full text-[11.5px]"
                              style={{ background: "#13243F", border: "1px solid rgba(255,255,255,0.10)" }}
                            >
                              <span
                                className="h-5 w-5 rounded-full flex items-center justify-center text-[9.5px]"
                                style={{ background: p?.avatar_color ?? "#1B2D4F" }}
                              >
                                {initials}
                              </span>
                              <span className="text-white/90 max-w-[140px] truncate">{name}</span>
                              <button
                                onClick={() => removeAssignment(a)}
                                className="opacity-50 hover:opacity-100 text-white/70"
                                title="Remove"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
