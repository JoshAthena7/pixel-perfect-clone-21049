import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export type BriefingRow = {
  id: string;
  type: "global" | "direct";
  sender_id: string;
  sender_name: string;
  sender_role: string | null;
  recipient_id: string | null;
  recipient_name: string | null;
  subject: string;
  body: string;
  sent_at: string;
  acknowledged_at: string | null;
};

/** List briefings visible to me, with my acknowledgment status. */
export const listMyBriefings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: briefings, error } = await supabase
      .from("briefings")
      .select(
        "id,type,sender_id,sender_name,sender_role,recipient_id,subject,body,sent_at",
      )
      .eq("is_deleted", false)
      .or(`type.eq.global,recipient_id.eq.${userId}`)
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (briefings ?? []).map((b: any) => b.id);
    let ackMap = new Map<string, string>();
    if (ids.length) {
      const { data: acks } = await supabase
        .from("briefing_acknowledgments")
        .select("briefing_id,acknowledged_at")
        .eq("user_id", userId)
        .in("briefing_id", ids);
      ackMap = new Map(
        (acks ?? []).map((a: any) => [a.briefing_id, a.acknowledged_at]),
      );
    }

    return (briefings ?? []).map((b: any) => ({
      ...b,
      recipient_name: null,
      acknowledged_at: ackMap.get(b.id) ?? null,
    })) as BriefingRow[];
  });

/** Count of unacknowledged briefings for the nav badge + pinned banner. */
export const getUnacknowledgedBriefings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: briefings, error } = await supabase
      .from("briefings")
      .select("id,type,sender_name,subject,body,sent_at")
      .eq("is_deleted", false)
      .or(`type.eq.global,recipient_id.eq.${userId}`)
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (briefings ?? []).map((b: any) => b.id);
    if (!ids.length) return { count: 0, pending: [] as any[] };

    const { data: acks } = await supabase
      .from("briefing_acknowledgments")
      .select("briefing_id")
      .eq("user_id", userId)
      .in("briefing_id", ids);
    const acked = new Set((acks ?? []).map((a: any) => a.briefing_id));
    const pending = (briefings ?? []).filter((b: any) => !acked.has(b.id));
    return { count: pending.length, pending };
  });

/** Record an acknowledgment. Idempotent. */
export const acknowledgeBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ briefingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("briefing_acknowledgments")
      .upsert(
        { briefing_id: data.briefingId, user_id: userId },
        { onConflict: "briefing_id,user_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Send a briefing. Admin-only. */
export const sendBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        type: z.enum(["global", "direct"]),
        subject: z.string().min(1).max(255),
        body: z.string().min(1).max(10_000),
        recipientId: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) {
      throw new Error("Only leadership can send briefings.");
    }
    if (data.type === "direct" && !data.recipientId) {
      throw new Error("Direct briefings require a recipient.");
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name,email")
      .eq("id", userId)
      .maybeSingle();
    const senderName =
      prof?.display_name?.trim() ||
      prof?.email?.split("@")[0] ||
      "Leadership";

    const { data: inserted, error } = await supabase
      .from("briefings")
      .insert({
        type: data.type,
        sender_id: userId,
        sender_name: senderName,
        sender_role: "Leadership",
        recipient_id: data.type === "direct" ? data.recipientId : null,
        subject: data.subject.trim(),
        body: data.body.trim(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

/** Admin: list every briefing with delivery counts. */
export const listAllBriefingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: briefings } = await supabaseAdmin
      .from("briefings")
      .select(
        "id,type,sender_name,recipient_id,subject,body,sent_at,is_deleted",
      )
      .order("sent_at", { ascending: false });

    const ids = (briefings ?? []).map((b: any) => b.id);
    let counts = new Map<string, number>();
    if (ids.length) {
      const { data: acks } = await supabaseAdmin
        .from("briefing_acknowledgments")
        .select("briefing_id")
        .in("briefing_id", ids);
      (acks ?? []).forEach((a: any) => {
        counts.set(a.briefing_id, (counts.get(a.briefing_id) ?? 0) + 1);
      });
    }

    const { count: totalUsers } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    // recipient names
    const recipIds = Array.from(
      new Set(
        (briefings ?? [])
          .map((b: any) => b.recipient_id)
          .filter(Boolean) as string[],
      ),
    );
    let nameMap = new Map<string, string>();
    if (recipIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,email")
        .in("id", recipIds);
      nameMap = new Map(
        (profs ?? []).map((p: any) => [
          p.id,
          p.display_name?.trim() || p.email || "Unknown",
        ]),
      );
    }

    return (briefings ?? []).map((b: any) => ({
      ...b,
      recipient_name: b.recipient_id ? nameMap.get(b.recipient_id) ?? null : null,
      ack_count: counts.get(b.id) ?? 0,
      audience_size: b.type === "global" ? totalUsers ?? 0 : 1,
    }));
  });

/** Admin: per-user delivery report for a single briefing. */
export const getBriefingDeliveryReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ briefingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Forbidden");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: briefing } = await supabaseAdmin
      .from("briefings")
      .select("id,type,recipient_id,subject,body,sent_at,sender_name")
      .eq("id", data.briefingId)
      .maybeSingle();
    if (!briefing) throw new Error("Briefing not found");

    const { data: acks } = await supabaseAdmin
      .from("briefing_acknowledgments")
      .select("user_id,acknowledged_at,ip_address")
      .eq("briefing_id", data.briefingId);
    const ackMap = new Map(
      (acks ?? []).map((a: any) => [a.user_id, a]),
    );

    let audience: { id: string; name: string }[] = [];
    if (briefing.type === "global") {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,email")
        .order("display_name", { ascending: true });
      audience = (profs ?? []).map((p: any) => ({
        id: p.id,
        name: p.display_name?.trim() || p.email || "Unknown",
      }));
    } else if (briefing.recipient_id) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,email")
        .eq("id", briefing.recipient_id)
        .maybeSingle();
      if (p)
        audience = [
          {
            id: p.id,
            name: p.display_name?.trim() || p.email || "Unknown",
          },
        ];
    }

    return {
      briefing,
      rows: audience.map((u) => {
        const a = ackMap.get(u.id) as any;
        return {
          user_id: u.id,
          name: u.name,
          acknowledged_at: a?.acknowledged_at ?? null,
        };
      }),
    };
  });

/** Admin: list of users (for recipient picker on Direct Briefings). */
export const listBriefingRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name,email")
      .order("display_name", { ascending: true });
    return (data ?? []).map((p: any) => ({
      id: p.id as string,
      name: (p.display_name?.trim() || p.email || "Unknown") as string,
      email: (p.email ?? "") as string,
    }));
  });
