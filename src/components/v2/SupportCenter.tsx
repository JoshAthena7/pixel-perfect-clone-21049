import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState, useParams } from "@tanstack/react-router";
import { Laptop, Wallet, Sparkles, Briefcase, ExternalLink, ArrowLeft, X, Inbox } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Atlas — Support Center overlay.
 * Triggered globally by dispatching `window.dispatchEvent(new CustomEvent("atlas:open-support"))`.
 * Five categories: IT, Billing, Platform Help, Ask Leanne, Talent Desk.
 */

type Category = "it" | "billing" | "platform" | "leanne" | "talent_desk";
type Urgency = "right_now" | "today" | "no_rush";

type Settings = {
  it_contact_email: string | null;
  billing_contact_email: string | null;
  pm_user_id: string | null;
  pm_contact_email: string | null;
  talent_desk_url: string | null;
  talent_desk_quick_links: { label: string; url: string }[];
};

type Request = {
  id: string;
  category: Category;
  body: string;
  urgency: Urgency;
  status: "open" | "in_progress" | "resolved";
  context: string | null;
  created_at: string;
};

const DEFAULT_QUICK_LINKS = [
  { label: "New SOW", url: "" },
  { label: "Send Invoice", url: "" },
  { label: "View Contract", url: "" },
  { label: "Onboarding Documents", url: "" },
  { label: "Expense Report", url: "" },
];

function useSupportSettings() {
  return useQuery<Settings>({
    queryKey: ["app_support_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_support_settings").select("*").eq("id", 1).maybeSingle();
      const links = Array.isArray(data?.talent_desk_quick_links) ? data!.talent_desk_quick_links : [];
      return {
        it_contact_email: data?.it_contact_email ?? null,
        billing_contact_email: data?.billing_contact_email ?? null,
        pm_user_id: data?.pm_user_id ?? null,
        pm_contact_email: data?.pm_contact_email ?? null,
        talent_desk_url: data?.talent_desk_url ?? null,
        talent_desk_quick_links: links as { label: string; url: string }[],
      };
    },
    staleTime: 30_000,
  });
}

function useMyRequests(open: boolean) {
  return useQuery<Request[]>({
    queryKey: ["my_support_requests"],
    enabled: open,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("support_requests")
        .select("id,category,body,urgency,status,context,created_at")
        .eq("requester_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Request[];
    },
  });
}

const CATEGORY_META: Record<Category, { title: string; subtitle: string; placeholder: string; sendLabel: string; toastText: string; icon: React.ReactNode; accent: string }> = {
  it: {
    title: "IT Support",
    subtitle: "Login issues, system errors, access problems, software help",
    placeholder: "Describe the issue — what happened, what you expected, what you see instead…",
    sendLabel: "Send to Leanne",
    toastText: "Leanne has been notified. She'll respond shortly.",
    icon: <Laptop className="h-6 w-6 text-[#3b7fff]" strokeWidth={1.5} />,
    accent: "#3b7fff",
  },
  billing: {
    title: "Billing",
    subtitle: "Invoices, expense reports, payment questions, timesheets",
    placeholder: "Describe your billing question or issue…",
    sendLabel: "Send to Leanne",
    toastText: "Leanne has been notified.",
    icon: <Wallet className="h-6 w-6 text-[#facc15]" strokeWidth={1.5} />,
    accent: "#facc15",
  },
  platform: {
    title: "Platform Help",
    subtitle: "How to use Atlas, IRIS questions, feature guidance",
    placeholder: "Ask anything about Atlas — IRIS knows every feature and workflow…",
    sendLabel: "Send to Josh",
    toastText: "Josh has been notified.",
    icon: <Sparkles className="h-6 w-6 text-[#22d3ee]" strokeWidth={1.5} />,
    accent: "#22d3ee",
  },

  leanne: {
    title: "Ask Leanne",
    subtitle: "Anything operational — scheduling, assignments, mission questions",
    placeholder: "Ask Leanne anything — she's here to help…",
    sendLabel: "Send to Leanne",
    toastText: "Leanne has been notified and will respond shortly.",
    icon: <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 text-sm font-medium">L</span>,
    accent: "#22c55e",
  },
  talent_desk: {
    title: "Talent Desk",
    subtitle: "Contracts, SOWs, billing setup, onboarding, engagement agreements",
    placeholder: "",
    sendLabel: "",
    toastText: "",
    icon: <Briefcase className="h-6 w-6 text-[#f59e0b]" strokeWidth={1.5} />,
    accent: "#f59e0b",
  },
};

export function SupportCenterMount() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("atlas:open-support", handler);
    return () => window.removeEventListener("atlas:open-support", handler);
  }, []);
  if (!open) return null;
  return <SupportCenter onClose={() => setOpen(false)} />;
}

function SupportCenter({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<"grid" | "form" | "history">("grid");
  const [category, setCategory] = useState<Category | null>(null);
  const settings = useSupportSettings();
  const myRequests = useMyRequests(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atlas Support Center"
      className="fixed inset-0 z-[120] overflow-y-auto"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.10), #060b14 50%)",
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close support"
        className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
      >
        <X size={18} strokeWidth={1.5} />
      </button>

      <div className="mx-auto max-w-5xl px-6 pt-16 pb-24">
        {view === "grid" && (
          <Grid
            settings={settings.data}
            onPick={(c) => {
              if (c === "talent_desk") {
                const url = settings.data?.talent_desk_url;
                if (!url) {
                  toast.error("Talent Desk URL is not configured yet. Ask an admin to set it in Olympus → Settings.");
                  return;
                }
                toast("Opening Talent Desk…");
                window.open(url, "_blank", "noopener,noreferrer");
                return;
              }
              setCategory(c);
              setView("form");
            }}
            historyCount={myRequests.data?.filter((r) => r.status !== "resolved").length ?? 0}
            onHistory={() => setView("history")}
          />
        )}

        {view === "form" && category && (
          <RequestForm
            category={category}
            onBack={() => setView("grid")}
            onSubmitted={() => { setView("grid"); myRequests.refetch(); }}
          />
        )}

        {view === "history" && (
          <History requests={myRequests.data ?? []} onBack={() => setView("grid")} />
        )}
      </div>
    </div>
  );
}

function Grid({
  settings, onPick, onHistory, historyCount,
}: {
  settings: Settings | undefined;
  onPick: (c: Category) => void;
  onHistory: () => void;
  historyCount: number;
}) {
  const quickLinks = (settings?.talent_desk_quick_links?.length ? settings.talent_desk_quick_links : DEFAULT_QUICK_LINKS).filter((l) => l.label);

  return (
    <>
      <div className="text-center mb-10">
        <h1 className="text-[28px] font-light text-white tracking-tight">How can we help?</h1>
        <p className="mt-2 text-sm text-muted-foreground">We're here. Tell us what you need.</p>
      </div>

      {historyCount > 0 && (
        <div className="mb-4 flex justify-center">
          <button
            onClick={onHistory}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-muted-foreground hover:border-white/20 hover:text-foreground"
          >
            <Inbox size={12} /> Your support requests
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] text-amber-200">
              {historyCount}
            </span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CategoryCard category="it" onClick={() => onPick("it")} />
        <CategoryCard category="billing" onClick={() => onPick("billing")} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <CategoryCard category="platform" onClick={() => onPick("platform")} />
        <CategoryCard category="leanne" onClick={() => onPick("leanne")} />
        <CategoryCard category="talent_desk" onClick={() => onPick("talent_desk")} external />
      </div>

      {quickLinks.length > 0 && settings?.talent_desk_url && (
        <div className="mt-10">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-3 text-center">
            Talent Desk Quick Links
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {quickLinks.map((l) => (
              <a
                key={l.label}
                href={l.url || settings.talent_desk_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.04] px-3 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/[0.08]"
              >
                {l.label} →
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CategoryCard({ category, onClick, external }: { category: Category; onClick: () => void; external?: boolean }) {
  const meta = CATEGORY_META[category];
  return (
    <button
      onClick={onClick}
      className="group relative text-left rounded-xl border border-white/10 bg-white/[0.02] p-6 min-h-[140px] transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/[0.04]"
      style={{
        // Per-card hover accent via CSS variable
        ["--accent" as never]: meta.accent,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = meta.accent + "66";
        e.currentTarget.style.boxShadow = `0 0 24px ${meta.accent}1a`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {external && (
        <span className="absolute right-3 top-3 text-amber-300/70">
          <ExternalLink size={14} strokeWidth={1.5} />
        </span>
      )}
      <div className="mb-3">{meta.icon}</div>
      <div className="text-sm font-medium text-foreground">{meta.title}</div>
      {category === "leanne" && <div className="text-[11px] text-muted-foreground mt-0.5">Project Manager</div>}
      <div className="mt-2 text-[12px] leading-snug text-muted-foreground">{meta.subtitle}</div>
      {external && (
        <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-amber-300/80">Opens Talent Desk →</div>
      )}
    </button>
  );
}

function RequestForm({
  category, onBack, onSubmitted,
}: { category: Category; onBack: () => void; onSubmitted: () => void }) {
  const meta = CATEGORY_META[category];
  const [body, setBody] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("today");
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params.missionId;
  const qc = useQueryClient();

  // Auto-detect context
  const defaultContext = useMemo(() => {
    if (!missionId) return "";
    const screen = path.split("/").pop() || "Mission Room";
    return `Mission ${missionId.slice(0, 8)} · ${screen}`;
  }, [path, missionId]);
  const [context, setContext] = useState(defaultContext);

  const submit = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("support_requests").insert({
        requester_id: u.user.id,
        mission_id: missionId ?? null,
        category,
        body: body.trim(),
        urgency,
        context: context.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      let msg = meta.toastText;
      if (category === "leanne" && urgency === "right_now") {
        msg = "Leanne has been notified urgently.";
      }
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["my_support_requests"] });
      qc.invalidateQueries({ queryKey: ["support_queue"] });
      onSubmitted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        {meta.icon}
        <div>
          <div className="text-lg text-foreground">{meta.title}</div>
          {category === "leanne" && <div className="text-[11px] text-muted-foreground">Project Manager</div>}
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">
            What do you need help with?
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={meta.placeholder}
            className="w-full min-h-[120px] rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-white/20"
          />
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">
            How urgent is this?
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {([
              { v: "right_now", emoji: "🚨", title: "Right Now", sub: "Blocking my work today", color: "#ef4444" },
              { v: "today", emoji: "⏰", title: "Today", sub: "Needs attention today", color: "#f59e0b" },
              { v: "no_rush", emoji: "📅", title: "No Rush", sub: "Whenever you get a chance", color: "#94a3b8" },
            ] as const).map((u) => {
              const active = urgency === u.v;
              return (
                <button
                  key={u.v}
                  onClick={() => setUrgency(u.v)}
                  className={`rounded-lg border p-3 text-left transition-colors ${active ? "bg-white/[0.05]" : "bg-white/[0.02] hover:bg-white/[0.04]"}`}
                  style={{ borderColor: active ? u.color + "80" : "rgba(255,255,255,0.1)" }}
                >
                  <div className="text-base mb-1">{u.emoji} <span className="text-sm text-foreground">{u.title}</span></div>
                  <div className="text-[11px] text-muted-foreground">{u.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {context && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">
              Attach Context
            </div>
            <div className="flex items-center gap-2">
              <input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="flex-1 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] text-muted-foreground focus:outline-none focus:border-white/20"
              />
              <button onClick={() => setContext("")} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onBack} className="rounded-md px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={() => submit.mutate()}
            disabled={!body.trim() || submit.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--accent,#3b7fff)] px-4 py-2 text-[12px] font-medium text-white hover:bg-[color:var(--accent,#3b7fff)]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submit.isPending ? "Sending…" : meta.sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function History({ requests, onBack }: { requests: Request[]; onBack: () => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="text-lg text-foreground mb-4">Your support requests</div>
      {requests.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
          No support requests yet.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => {
            const meta = CATEGORY_META[r.category];
            return (
              <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                  <span className="text-foreground">{meta.title}</span>
                  <span>·</span>
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    {r.status.replace("_", " ")}
                  </span>
                </div>
                <div className="text-sm text-foreground whitespace-pre-wrap">{r.body}</div>
                {r.context && <div className="mt-1 text-[11px] text-muted-foreground">{r.context}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
