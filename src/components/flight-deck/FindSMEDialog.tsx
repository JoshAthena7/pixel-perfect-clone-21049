import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Users } from "lucide-react";

type Sme = {
  id: string;
  name: string;
  expertise: string[];
  source: "stakeholder" | "team";
};

export function FindSMEDialog({
  open,
  onOpenChange,
  missionId,
  onMessage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  onMessage?: (name: string) => void;
}) {
  const { data: smes = [], isLoading } = useQuery({
    queryKey: ["find-sme", missionId, open],
    enabled: open && !!missionId,
    queryFn: async (): Promise<Sme[]> => {
      const [stakeRes, teamRes] = await Promise.all([
        supabase
          .from("stakeholder_profiles")
          .select("id,name,role,expertise_areas")
          .eq("mission_id", missionId!)
          .limit(20),
        supabase
          .from("mission_team_members")
          .select("member_id,mission_role,atlas_team_members(display_name,expertise_areas)")
          .eq("mission_id", missionId!)
          .ilike("mission_role", "%sme%"),
      ]);
      const out: Sme[] = [];
      (stakeRes.data ?? []).forEach((s: any) => {
        out.push({
          id: s.id,
          name: s.name ?? "Unnamed stakeholder",
          expertise: Array.isArray(s.expertise_areas) ? s.expertise_areas : [],
          source: "stakeholder",
        });
      });
      (teamRes.data ?? []).forEach((t: any) => {
        const m = t.atlas_team_members ?? {};
        out.push({
          id: t.member_id,
          name: m.display_name ?? "Team member",
          expertise: Array.isArray(m.expertise_areas) ? m.expertise_areas : [],
          source: "team",
        });
      });
      return out;
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Find a Subject Matter Expert
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {isLoading && <p className="text-xs text-muted-foreground">Searching…</p>}
          {!isLoading && smes.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              IRIS hasn't matched any SMEs for this mission yet.
            </p>
          )}
          {smes.map((s) => (
            <div
              key={`${s.source}-${s.id}`}
              className="rounded-lg border border-border bg-background/40 p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{s.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                  {s.source === "stakeholder" ? "Stakeholder" : "Mission SME"}
                </div>
                {s.expertise.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.expertise.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted-foreground border border-border"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => onMessage?.(s.name)}
              >
                <MessageCircle className="h-3 w-3 mr-1" />
                Message
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
