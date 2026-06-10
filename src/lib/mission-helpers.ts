import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
}

export async function logAudit(args: {
  missionId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  // Fire-and-forget: audit must never block or throw to the caller.
  try {
    const { data: u } = await supabase.auth.getUser();
    const performedByName =
      (u.user?.user_metadata?.full_name as string | undefined) ??
      u.user?.email ??
      "Unknown";
    const { error } = await supabase.from("mission_audit_log").insert({
      mission_id: args.missionId,
      action: args.action,
      performed_by: u.user?.id ?? null,
      performed_by_name: performedByName,
      metadata: (args.metadata ?? {}) as any,
    });
    if (error) console.warn("[mission-audit] insert failed:", error.message);
  } catch (err) {
    console.warn("[mission-audit] unexpected error:", err);
  }
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    const blob = new Blob([""], { type: "text/csv" });
    triggerDownload(blob, filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv" }), filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function slugForFilename(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
