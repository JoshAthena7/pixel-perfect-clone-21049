import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, X, ExternalLink, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/olympus/change-requests")({
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: ChangeRequestsAdmin,
});

type Filter = "open" | "resolved" | "dismissed" | "all";

type Row = {
  id: string;
  user_id: string;
  mission_id: string | null;
  surface: string;
  context: Record<string, any>;
  message: string;
  status: string;
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

function ChangeRequestsAdmin() {
  const [filter, setFilter] = useState<Filter>("open");
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-change-requests", filter],
    queryFn: async () => {
      let q = supabase
        .from("change_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const userIds = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.user_id))),
    [rows],
  );
  const { data: profiles } = useQuery({
    queryKey: ["admin-change-requests-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", userIds);
      return new Map((data ?? []).map((p: any) => [p.id, p]));
    },
  });

  const missionIds = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.mission_id).filter(Boolean))) as string[],
    [rows],
  );
  const { data: missions } = useQuery({
    queryKey: ["admin-change-requests-missions", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name").in("id", missionIds);
      return new Map((data ?? []).map((m: any) => [m.id, m]));
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (input: { id: string; status: "resolved" | "dismissed"; admin_notes?: string }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("change_requests")
        .update({
          status: input.status,
          admin_notes: input.admin_notes ?? null,
          resolved_by: userRes.user?.id ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-change-requests"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  return (
    <div className="p-6 space-y-4" style={{ background: "#070f1c", minHeight: "100vh", color: "white" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2" style={{ fontSize: 18, fontWeight: 600 }}>
            <Inbox className="h-4 w-4" style={{ color: "#C49A2B" }} />
            Change Requests
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            User-flagged corrections, additions, and edits to read-only IRIS content.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {(["open", "resolved", "dismissed", "all"] as Filter[]).map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="rounded-full capitalize"
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  color: active ? "#C49A2B" : "rgba(255,255,255,0.5)",
                  background: active ? "rgba(196,154,43,0.12)" : "transparent",
                  border: `0.5px solid ${active ? "rgba(196,154,43,0.3)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Loading…</div>
      ) : (rows ?? []).length === 0 ? (
        <div
          className="rounded-lg text-center"
          style={{
            padding: 40,
            background: "rgba(255,255,255,0.02)",
            border: "0.5px dashed rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.45)",
            fontSize: 12,
          }}
        >
          No {filter} change requests.
        </div>
      ) : (
        <div className="space-y-3">
          {(rows ?? []).map((r) => (
            <RequestRow
              key={r.id}
              row={r}
              profile={profiles?.get(r.user_id)}
              missionName={r.mission_id ? missions?.get(r.mission_id)?.name : null}
              onResolve={(notes) => updateStatus.mutate({ id: r.id, status: "resolved", admin_notes: notes })}
              onDismiss={(notes) => updateStatus.mutate({ id: r.id, status: "dismissed", admin_notes: notes })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestRow({
  row,
  profile,
  missionName,
  onResolve,
  onDismiss,
}: {
  row: Row;
  profile?: { display_name?: string | null; email?: string | null };
  missionName?: string | null;
  onResolve: (notes: string) => void;
  onDismiss: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(row.admin_notes ?? "");
  const isOpen = row.status === "open";
  const ctx = row.context ?? {};
  const url = ctx.url as string | undefined;

  return (
    <div
      className="rounded-lg"
      style={{
        padding: 14,
        background: "rgba(255,255,255,0.02)",
        border: "0.5px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 10 }}>
            <span
              className="rounded"
              style={{ padding: "1px 6px", background: "rgba(196,154,43,0.1)", color: "#C49A2B" }}
            >
              {row.surface}
            </span>
            {ctx.section && (
              <span className="rounded" style={{ padding: "1px 6px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}>
                {String(ctx.section)}
              </span>
            )}
            {missionName && (
              <span className="rounded" style={{ padding: "1px 6px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}>
                Mission: {missionName}
              </span>
            )}
            <span
              className="rounded capitalize"
              style={{
                padding: "1px 6px",
                background: isOpen ? "rgba(255,180,60,0.12)" : "rgba(255,255,255,0.05)",
                color: isOpen ? "#FFB43C" : "rgba(255,255,255,0.5)",
              }}
            >
              {row.status}
            </span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>
              {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })} · {profile?.display_name ?? profile?.email ?? "user"}
            </span>
          </div>

          <p className="mt-2 whitespace-pre-wrap" style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            {row.message}
          </p>

          {ctx.snippet && (
            <div
              className="mt-2 rounded italic"
              style={{
                padding: "6px 10px",
                fontSize: 11,
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.55)",
                borderLeft: "2px solid rgba(196,154,43,0.4)",
              }}
            >
              "{String(ctx.snippet).slice(0, 240)}"
            </div>
          )}

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-2 hover:opacity-80"
              style={{ fontSize: 10, color: "#7BA7D4" }}
            >
              View source page <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-2">
          <Textarea
            placeholder="Admin notes (optional) — what did you do in Olympus?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onDismiss(notes)}>
              <X className="h-3.5 w-3.5 mr-1" />
              Dismiss
            </Button>
            <Button size="sm" onClick={() => onResolve(notes)}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Mark resolved
            </Button>
          </div>
        </div>
      )}

      {!isOpen && row.admin_notes && (
        <div className="mt-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>Admin notes:</span> {row.admin_notes}
        </div>
      )}
    </div>
  );
}
