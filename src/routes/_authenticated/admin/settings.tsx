import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FastReportsMenu } from "@/components/olympus/FastReportsMenu";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

type Tab = "team" | "firm";

function AdminSettings() {
  const [tab, setTab] = useState<Tab>("team");

  return (
    <div className="flex-1 min-w-0">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface/40 px-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[12px] font-extrabold uppercase tracking-[0.32em]">
            Olympus · <span className="text-foreground/70">Settings</span>
          </h1>
        </div>
        <FastReportsMenu />
      </header>

      <div className="border-b border-border bg-surface/20 px-5">
        <nav className="flex gap-1">
          <TabButton active={tab === "team"} onClick={() => setTab("team")} icon={<Users className="h-3.5 w-3.5" />}>Team</TabButton>
          <TabButton active={tab === "firm"} onClick={() => setTab("firm")} icon={<Building2 className="h-3.5 w-3.5" />}>Firm</TabButton>
        </nav>
      </div>

      <div className="p-5">
        {tab === "team" && <TeamTab />}
        {tab === "firm" && <FirmTab />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
        active ? "border-[color:var(--athena-gold)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function TeamTab() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["olympus-team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,email,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Team</h2>
        <button
          onClick={() => alert("Invite flow coming soon")}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
        >
          Invite User
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Name</th>
            <th className="px-4 py-2.5 text-left font-medium">Email</th>
            <th className="px-4 py-2.5 text-left font-medium">Joined</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No users yet.</td></tr>
          ) : (
            data.map((p: any) => (
              <tr key={p.id} className="border-t border-border/60">
                <td className="px-4 py-2.5">{p.display_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function FirmTab() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/20 p-10 text-center">
      <Building2 className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-medium">Firm configuration</div>
      <div className="mt-1 text-xs text-muted-foreground">Coming soon.</div>
    </div>
  );
}
