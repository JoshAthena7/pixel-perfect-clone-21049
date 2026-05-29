import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Mail, Phone } from "lucide-react";

type Contact = { display_name: string; email: string | null; phone: string | null; role: string };

export function WriterContactBar() {
  const { engagement } = useEngagement();
  const [lead, setLead] = useState<Contact | null>(null);
  const [pm, setPm] = useState<Contact | null>(null);

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("engagement_members")
      .select("display_name, email, phone, role")
      .eq("engagement_id", engagement.id)
      .in("role", ["engagement_lead", "pm"])
      .then(({ data }) => {
        const arr = (data as Contact[]) ?? [];
        setLead(arr.find((m) => m.role === "engagement_lead") ?? null);
        setPm(arr.find((m) => m.role === "pm") ?? null);
      });
  }, [engagement?.id]);

  const renderPerson = (label: string, c: Contact | null) => (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold text-foreground truncate">{c?.display_name ?? "—"}</span>
      {c?.email && (
        <a className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[var(--gold)]" href={`mailto:${c.email}`}>
          <Mail className="h-3 w-3" /> email
        </a>
      )}
      {c?.phone && (
        <a className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[var(--gold)]" href={`tel:${c.phone}`}>
          <Phone className="h-3 w-3" /> call
        </a>
      )}
    </div>
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-[#0a0f1c]/95 backdrop-blur pl-[180px]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
        {renderPerson("Engagement Lead", lead)}
        {renderPerson("Proposal Manager", pm)}
      </div>
    </div>
  );
}
