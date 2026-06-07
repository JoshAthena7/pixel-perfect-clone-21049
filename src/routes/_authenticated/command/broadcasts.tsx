import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Plus, CheckCircle2, AlertCircle, Clock, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { PersonFirstHint } from "@/components/v2/PersonFirstHint";

export const Route = createFileRoute("/_authenticated/command/broadcasts")({
  component: BroadcastsPage,
});

type Broadcast = {
  id: string;
  text: string;
  from_name: string;
  mission_id: string | null;
  created_at: string;
  slack_delivery_status: string | null;
  slack_delivered_at: string | null;
  slack_error: string | null;
};

type Mission = { id: string; name: string };

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function SlackStatusBadge({ b }: { b: Broadcast }) {
  const s = b.slack_delivery_status ?? "not_sent";
  if (s === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-400 px-2 py-0.5 text-[10px] font-medium" title={b.slack_delivered_at ? `Slack · ${relTime(b.slack_delivered_at)}` : "Delivered to Slack"}>
        <CheckCircle2 className="h-3 w-3" /> Slack delivered
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-400 px-2 py-0.5 text-[10px] font-medium" title={b.slack_error ?? "Slack delivery failed"}>
        <AlertCircle className="h-3 w-3" /> Slack failed
      </span>
    );
  }
  if (s === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-400 px-2 py-0.5 text-[10px] font-medium">
        <Clock className="h-3 w-3" /> Slack pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover text-muted-foreground px-2 py-0.5 text-[10px] font-medium" title="Slack webhook not configured for this scope">
      <MinusCircle className="h-3 w-3" /> No Slack
    </span>
  );
}

function BroadcastsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: broadcasts = [], isLoading } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcasts")
        .select("id,text,from_name,mission_id,created_at,slack_delivery_status,slack_delivered_at,slack_error")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Broadcast[];
    },
  });

  const { data: missions = [] } = useQuery({
    queryKey: ["missions-min"],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name").order("name");
      return (data ?? []) as Mission[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("broadcasts-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcasts" }, () =>
        qc.invalidateQueries({ queryKey: ["broadcasts"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const missionName = (id: string | null) => (id ? missions.find((m) => m.id === id)?.name ?? "Mission" : null);

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> Broadcasts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Announcements across all missions, newest first.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Publish Broadcast</Button>
          </DialogTrigger>
          <PublishDialog missions={missions} onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">One moment…</div>
      ) : broadcasts.length === 0 ? (
        <div className="rounded-md border border-border bg-surface px-6 py-16 text-center">
          <Megaphone className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <div className="text-sm font-medium">No broadcasts yet</div>
          <div className="text-xs text-muted-foreground mt-1">Publish the first announcement above.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => (
            <article key={b.id} className="rounded-md border border-border bg-surface p-4">
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="font-medium text-foreground">{b.from_name}</span>
                {b.mission_id && (
                  <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    {missionName(b.mission_id)}
                  </span>
                )}
                {!b.mission_id && (
                  <span className="rounded-full bg-surface-hover text-muted-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    Global
                  </span>
                )}
                <SlackStatusBadge b={b} />
                <span className="text-muted-foreground ml-auto">{relTime(b.created_at)}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{b.text}</p>
              {b.slack_delivery_status === "failed" && b.slack_error && (
                <p className="mt-2 text-[11px] text-rose-400/80">Slack error: {b.slack_error}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function PublishDialog({ missions, onClose }: { missions: Mission[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [fromName, setFromName] = useState("");
  const [missionId, setMissionId] = useState<string>("global");
  const [text, setText] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", u.id)
        .maybeSingle()
        .then(({ data: p }) => setFromName(p?.display_name ?? u.email?.split("@")[0] ?? ""));
    });
  }, []);

  const publish = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("broadcasts").insert({
        user_id: u.user.id,
        from_name: fromName.trim(),
        text: text.trim(),
        mission_id: missionId === "global" ? null : missionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Broadcast published");
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      setText("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled = !fromName.trim() || !text.trim() || publish.isPending;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Publish Broadcast</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scope">Mission scope</Label>
          <Select value={missionId} onValueChange={setMissionId}>
            <SelectTrigger id="scope"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global — all missions</SelectItem>
              {missions.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="msg">Message</Label>
          <Textarea id="msg" value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="What do you want to announce?" />
          <PersonFirstHint value={text} onChange={setText} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => publish.mutate()} disabled={disabled}>
          {publish.isPending ? "Publishing…" : "Publish"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
