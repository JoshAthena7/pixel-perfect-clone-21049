// PF-1: Phone a Friend panel — right-side Sheet with Athena Experts + Client Contacts tabs.
// Athena Experts tab is live in PF-1. Client Contacts tab is wired in PF-2.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type AthenaSme = {
  id: string;
  display_name: string;
  title: string | null;
  organization: string | null;
  email: string;
  phone: string | null;
  expertise_areas: string[] | null;
  bio: string | null;
  availability: "available" | "limited" | "unavailable";
  is_active: boolean;
};

type Tab = "athena" | "client";

export function PhoneAFriendPanel({
  open,
  onOpenChange,
  missionId,
  missionName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string;
  missionName?: string;
}) {
  const [tab, setTab] = useState<Tab>("athena");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 overflow-hidden flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.22em]">
            <Phone className="h-4 w-4 text-[color:var(--athena-gold,#C9A84C)]" />
            Phone a Friend
          </SheetTitle>
        </SheetHeader>

        <div className="flex border-b border-border bg-surface/30">
          <TabBtn active={tab === "athena"} onClick={() => setTab("athena")}>
            Athena Experts
          </TabBtn>
          <TabBtn active={tab === "client"} onClick={() => setTab("client")}>
            Client Contacts
          </TabBtn>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "athena" ? (
            <AthenaExpertsTab />
          ) : (
            <ClientContactsTab missionId={missionId} missionName={missionName} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors"
      style={{
        color: active ? "var(--athena-gold,#C9A84C)" : "var(--muted-foreground)",
        borderBottom: `2px solid ${active ? "var(--athena-gold,#C9A84C)" : "transparent"}`,
        background: active ? "rgba(201,168,76,0.04)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function AthenaExpertsTab() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const { data: smes = [], isLoading } = useQuery<AthenaSme[]>({
    queryKey: ["athena-smes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athena_smes")
        .select("id,display_name,title,organization,email,phone,expertise_areas,bio,availability,is_active")
        .eq("is_active", true)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AthenaSme[];
    },
  });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of smes) for (const t of s.expertise_areas ?? []) set.add(t);
    return Array.from(set).sort();
  }, [smes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = smes.filter((s) => {
      if (activeFilter && !(s.expertise_areas ?? []).includes(activeFilter)) return false;
      if (!q) return true;
      const inName = s.display_name.toLowerCase().includes(q);
      const inExp = (s.expertise_areas ?? []).some((t) => t.toLowerCase().includes(q));
      return inName || inExp;
    });
    // Unavailable to bottom
    return list.sort((a, b) => {
      const aU = a.availability === "unavailable" ? 1 : 0;
      const bU = b.availability === "unavailable" ? 1 : 0;
      return aU - bU;
    });
  }, [smes, search, activeFilter]);

  return (
    <div className="p-4 space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or expertise…"
        maxLength={100}
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-[color:var(--athena-gold,#C9A84C)]/50"
      />

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const active = activeFilter === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveFilter(active ? null : tag)}
                className="rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors"
                style={{
                  border: `1px solid ${active ? "rgba(201,168,76,0.7)" : "rgba(201,168,76,0.3)"}`,
                  background: active ? "rgba(201,168,76,0.12)" : "transparent",
                  color: "#C9A84C",
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="py-10 text-center text-xs text-muted-foreground">One moment…</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">
          No experts match your search.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((sme) => (
            <SmeCard key={sme.id} sme={sme} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SmeCard({ sme }: { sme: AthenaSme }) {
  const [bioOpen, setBioOpen] = useState(false);
  const dotColor =
    sme.availability === "available" ? "#22C55E" : sme.availability === "limited" ? "#F59E0B" : "#EF4444";
  const muted = sme.availability === "unavailable";

  return (
    <li
      className="rounded-lg border border-border bg-surface/40 p-3"
      style={{ opacity: muted ? 0.55 : 1 }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ background: dotColor }}
          title={sme.availability}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-foreground truncate">{sme.display_name}</div>
          {sme.title && (
            <div className="text-[11px] text-muted-foreground truncate">{sme.title}</div>
          )}
          {(sme.expertise_areas ?? []).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(sme.expertise_areas ?? []).map((t) => (
                <span
                  key={t}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: "rgba(201,168,76,0.10)",
                    color: "#C9A84C",
                    border: "1px solid rgba(201,168,76,0.25)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <a
              href={`mailto:${encodeURIComponent(sme.email)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-hover"
            >
              <Mail className="h-3 w-3" /> Email
            </a>
            {sme.phone && (
              <a
                href={`tel:${sme.phone.replace(/[^0-9+]/g, "")}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-hover"
              >
                <Phone className="h-3 w-3" /> Call
              </a>
            )}
            {sme.bio && (
              <button
                type="button"
                onClick={() => setBioOpen((v) => !v)}
                className="ml-auto inline-flex items-center rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {bioOpen ? "Hide" : "About"}
              </button>
            )}
          </div>
          {bioOpen && sme.bio && (
            <div className="mt-2 rounded-md border border-border bg-background/40 p-2 text-[12px] text-muted-foreground whitespace-pre-wrap">
              {sme.bio}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// Placeholder — wired in PF-2.
function ClientContactsTab({ missionId, missionName }: { missionId: string; missionName?: string }) {
  return (
    <div className="p-6 text-center text-xs text-muted-foreground">
      Client contacts are configured in Mission Setup. See prompt PF-2.
    </div>
  );
}
