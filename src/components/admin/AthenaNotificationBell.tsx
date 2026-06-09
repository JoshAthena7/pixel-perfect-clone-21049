import { useEffect, useState, useCallback } from "react";
import { Bell, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Notification = {
  id: string;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function AthenaNotificationBell({
  onOpenMember,
}: {
  onOpenMember?: (memberId: string) => void;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("atlas_notifications")
      .select("id,type,message,metadata,is_read,created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    setItems((data ?? []) as Notification[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const unread = items.filter((i) => !i.is_read).length;

  async function handleClick(n: Notification) {
    setOpen(false);
    if (!n.is_read) {
      await supabase
        .from("atlas_notifications")
        .update({ is_read: true })
        .eq("id", n.id);
      setItems((prev) =>
        prev.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)),
      );
    }
    const memberId =
      (n.metadata as { member_id?: string } | null)?.member_id ?? null;
    if (memberId && onOpenMember) onOpenMember(memberId);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/40 hover:bg-surface"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
              style={{ background: "#C9922A", boxShadow: "0 0 0 2px hsl(var(--background))" }}
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/70">
            Notifications
          </div>
          {unread > 0 && (
            <span className="text-[11px] text-foreground/60">
              {unread} unread
            </span>
          )}
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-foreground/60" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-foreground/60">
              No notifications yet.
            </div>
          ) : (
            <ul>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`cursor-pointer border-b border-border/40 px-3 py-2.5 text-sm last:border-b-0 hover:bg-surface/60 ${
                    !n.is_read ? "bg-surface/30" : ""
                  }`}
                  onClick={() => void handleClick(n)}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span
                        aria-hidden
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: "#C9922A" }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground">{n.message}</div>
                      <div className="mt-0.5 text-[11px] text-foreground/55">
                        {relativeTime(n.created_at)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
