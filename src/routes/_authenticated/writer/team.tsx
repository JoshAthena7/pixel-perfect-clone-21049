import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mail, Phone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/writer/team")({
  head: () => ({ meta: [{ title: "Team Directory — Writer Portal" }] }),
  component: WriterTeam,
});

function WriterTeam() {
  const { engagement } = useEngagement();
  const [members, setMembers] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("engagement_members")
      .select("id, display_name, email, phone")
      .eq("engagement_id", engagement.id)
      .order("display_name", { ascending: true })
      .then(({ data }) => setMembers(data ?? []));
  }, [engagement?.id]);

  const term = q.toLowerCase().trim();
  const visible = !term ? members : members.filter((m) => (m.display_name || "").toLowerCase().includes(term));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">Find a teammate and how to reach them.</p>
      </div>
      <Input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {visible.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No teammates found.</Card>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => (
            <Card key={m.id} className="border-border bg-surface p-4">
              <div className="text-sm font-semibold">{m.display_name}</div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                {m.email && (
                  <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={`mailto:${m.email}`}>
                    <Mail className="h-3.5 w-3.5" /> {m.email}
                  </a>
                )}
                {m.phone && (
                  <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={`tel:${m.phone}`}>
                    <Phone className="h-3.5 w-3.5" /> {m.phone}
                  </a>
                )}
                {!m.email && !m.phone && <span>No contact info on file.</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
