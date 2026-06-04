import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── List my threads (excluding archived unless requested) ─────────────────
export const listMyThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ archived: z.boolean().optional().default(false) }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: parts, error: pErr } = await supabase
      .from("signal_thread_participants")
      .select("thread_id, last_read_at, is_archived")
      .eq("user_id", userId)
      .eq("is_archived", data.archived);
    if (pErr) throw new Error(pErr.message);
    const ids = (parts ?? []).map((p) => p.thread_id);
    if (ids.length === 0) return { threads: [] as any[] };

    const { data: threads, error: tErr } = await supabase
      .from("signal_threads")
      .select("id, type, name, created_by, created_at, last_activity_at")
      .in("id", ids)
      .order("last_activity_at", { ascending: false });
    if (tErr) throw new Error(tErr.message);

    // participants for each
    const { data: allParts } = await supabase
      .from("signal_thread_participants")
      .select("thread_id, user_id")
      .in("thread_id", ids);
    const partMap = new Map<string, string[]>();
    (allParts ?? []).forEach((p) => {
      const arr = partMap.get(p.thread_id) ?? [];
      arr.push(p.user_id);
      partMap.set(p.thread_id, arr);
    });
    const allUserIds = Array.from(new Set((allParts ?? []).map((p) => p.user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, avatar_color, availability_status")
      .in("id", allUserIds);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    // last signal + unread
    const { data: lastSignals } = await supabase
      .from("signal_messages")
      .select("id, thread_id, sender_id, body, is_priority, sent_at")
      .in("thread_id", ids)
      .order("sent_at", { ascending: false });
    const lastByThread = new Map<string, any>();
    const countsByThread = new Map<string, { unread: number; hasPriority: boolean }>();
    const lastReadMap = new Map((parts ?? []).map((p) => [p.thread_id, p.last_read_at]));
    (lastSignals ?? []).forEach((s) => {
      if (!lastByThread.has(s.thread_id)) lastByThread.set(s.thread_id, s);
      const lr = lastReadMap.get(s.thread_id);
      const cur = countsByThread.get(s.thread_id) ?? { unread: 0, hasPriority: false };
      if (lr && new Date(s.sent_at) > new Date(lr) && s.sender_id !== userId) {
        cur.unread += 1;
        if (s.is_priority) cur.hasPriority = true;
      }
      countsByThread.set(s.thread_id, cur);
    });

    return {
      threads: threads!.map((t) => {
        const pids = partMap.get(t.id) ?? [];
        const others = pids.filter((id) => id !== userId).map((id) => profileMap.get(id)).filter(Boolean);
        const last = lastByThread.get(t.id);
        const counts = countsByThread.get(t.id) ?? { unread: 0, hasPriority: false };
        return {
          ...t,
          participants: pids.map((id) => profileMap.get(id)).filter(Boolean),
          others,
          last_signal: last
            ? { body: last.body, sent_at: last.sent_at, is_priority: last.is_priority, sender_id: last.sender_id }
            : null,
          unread_count: counts.unread,
          has_unread_priority: counts.hasPriority,
        };
      }),
    };
  });

// ── Unread total badge ───────────────────────────────────────────────────
export const getUnreadSignalsCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: parts } = await supabase
      .from("signal_thread_participants")
      .select("thread_id, last_read_at")
      .eq("user_id", userId)
      .eq("is_archived", false);
    const ids = (parts ?? []).map((p) => p.thread_id);
    if (ids.length === 0) return { count: 0 };
    const { data: msgs } = await supabase
      .from("signal_messages")
      .select("thread_id, sender_id, sent_at")
      .in("thread_id", ids);
    const lrMap = new Map((parts ?? []).map((p) => [p.thread_id, p.last_read_at]));
    let count = 0;
    (msgs ?? []).forEach((m) => {
      if (m.sender_id === userId) return;
      const lr = lrMap.get(m.thread_id);
      if (lr && new Date(m.sent_at) > new Date(lr)) count += 1;
    });
    return { count };
  });

// ── Search recipients ─────────────────────────────────────────────────────
export const searchRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().trim().max(100).default("") }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let query = supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url, avatar_color, availability_status, expertise_areas")
      .neq("id", userId)
      .limit(20);
    if (data.q) {
      query = query.or(`display_name.ilike.%${data.q}%,email.ilike.%${data.q}%`);
    }
    const { data: profs, error } = await query;
    if (error) throw new Error(error.message);
    return { results: profs ?? [] };
  });

// ── Get a single thread (with signals + pins + participants) ──────────────
export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: thread }, { data: parts }, { data: signals }, { data: pins }] = await Promise.all([
      supabase
        .from("signal_threads")
        .select("id, type, name, created_by, created_at, last_activity_at")
        .eq("id", data.threadId)
        .maybeSingle(),
      supabase
        .from("signal_thread_participants")
        .select("user_id, last_read_at, is_archived")
        .eq("thread_id", data.threadId),
      supabase
        .from("signal_messages")
        .select("id, sender_id, body, is_priority, quote_of, sent_at")
        .eq("thread_id", data.threadId)
        .order("sent_at", { ascending: true }),
      supabase
        .from("signal_pins")
        .select("signal_id, pinned_by, pinned_at")
        .eq("thread_id", data.threadId),
    ]);
    if (!thread) throw new Error("Thread not found");

    const userIds = Array.from(
      new Set([
        ...(parts ?? []).map((p) => p.user_id),
        ...(signals ?? []).map((s) => s.sender_id),
      ])
    );
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, avatar_color, availability_status, expertise_areas")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const me = (parts ?? []).find((p) => p.user_id === userId);
    return {
      thread,
      participants: parts ?? [],
      signals: signals ?? [],
      pins: pins ?? [],
      profiles: profiles ?? [],
      my_last_read_at: me?.last_read_at ?? null,
      my_is_archived: me?.is_archived ?? false,
    };
  });

// ── Create thread ────────────────────────────────────────────────────────
export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        recipientIds: z.array(z.string().uuid()).min(1).max(50),
        name: z.string().trim().max(100).optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isGroup = data.recipientIds.length > 1;
    if (isGroup && (!data.name || data.name.trim().length === 0)) {
      throw new Error("Group threads require a name");
    }

    // For direct: check if 1:1 thread already exists
    if (!isGroup) {
      const otherId = data.recipientIds[0];
      const { data: myThreads } = await supabase
        .from("signal_thread_participants")
        .select("thread_id")
        .eq("user_id", userId);
      const myIds = (myThreads ?? []).map((t) => t.thread_id);
      if (myIds.length) {
        const { data: theirs } = await supabase
          .from("signal_thread_participants")
          .select("thread_id")
          .eq("user_id", otherId)
          .in("thread_id", myIds);
        const shared = (theirs ?? []).map((t) => t.thread_id);
        if (shared.length) {
          const { data: dThreads } = await supabase
            .from("signal_threads")
            .select("id, type")
            .in("id", shared)
            .eq("type", "direct");
          if (dThreads && dThreads.length) return { thread_id: dThreads[0].id };
        }
      }
    }

    const { data: thread, error } = await supabase
      .from("signal_threads")
      .insert({
        type: isGroup ? "group" : "direct",
        name: isGroup ? data.name!.trim() : null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const rows = [userId, ...data.recipientIds.filter((id) => id !== userId)].map((uid) => ({
      thread_id: thread.id,
      user_id: uid,
    }));
    const { error: pErr } = await supabase.from("signal_thread_participants").insert(rows);
    if (pErr) throw new Error(pErr.message);
    return { thread_id: thread.id };
  });

// ── Send a Signal ────────────────────────────────────────────────────────
export const sendSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
        isPriority: z.boolean().optional().default(false),
        quoteOf: z.string().uuid().nullable().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: signal, error } = await supabase
      .from("signal_messages")
      .insert({
        thread_id: data.threadId,
        sender_id: userId,
        body: data.body,
        is_priority: !!data.isPriority,
        quote_of: data.quoteOf ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // mark sender as read up to now
    await supabase
      .from("signal_thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", data.threadId)
      .eq("user_id", userId);
    return { signal_id: signal.id };
  });

// ── Mark thread read / unread / archived ─────────────────────────────────
export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("signal_thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", data.threadId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markThreadUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // set last_read_at to epoch
    const { error } = await supabase
      .from("signal_thread_participants")
      .update({ last_read_at: new Date(0).toISOString() })
      .eq("thread_id", data.threadId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setThreadArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: z.string().uuid(), archived: z.boolean() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("signal_thread_participants")
      .update({ is_archived: data.archived })
      .eq("thread_id", data.threadId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Pins ─────────────────────────────────────────────────────────────────
export const togglePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: z.string().uuid(), signalId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("signal_pins")
      .select("id")
      .eq("thread_id", data.threadId)
      .eq("signal_id", data.signalId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("signal_pins").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { pinned: false };
    } else {
      const { error } = await supabase.from("signal_pins").insert({
        thread_id: data.threadId,
        signal_id: data.signalId,
        pinned_by: userId,
      });
      if (error) throw new Error(error.message);
      return { pinned: true };
    }
  });

// ── Set my availability status ────────────────────────────────────────────
export const setMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ status: z.enum(["available", "pens_down", "unavailable"]) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ availability_status: data.status })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
