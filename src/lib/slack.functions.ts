import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SLACK_GATEWAY = "https://connector-gateway.lovable.dev/slack/api";

async function slackFetch(method: string, query = ""): Promise<any> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const SLACK_API_KEY = process.env.SLACK_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!SLACK_API_KEY) throw new Error("Slack not connected");

  const res = await fetch(`${SLACK_GATEWAY}/${method}${query ? "?" + query : ""}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SLACK_API_KEY,
    },
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Slack ${method} returned non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok || !data.ok) {
    throw new Error(`Slack ${method} failed: ${data.error ?? res.status}`);
  }
  return data;
}

export const listSlackChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const channels: { id: string; name: string; is_member: boolean }[] = [];
    let cursor = "";
    do {
      const page = await slackFetch(
        "conversations.list",
        `limit=200&exclude_archived=true&types=public_channel${cursor ? `&cursor=${cursor}` : ""}`,
      );
      for (const c of page.channels ?? []) {
        channels.push({ id: c.id, name: c.name, is_member: !!c.is_member });
      }
      cursor = page.response_metadata?.next_cursor ?? "";
    } while (cursor);
    channels.sort((a, b) => a.name.localeCompare(b.name));
    return { channels };
  });

export const getSlackMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      channelId: z.string().min(1).max(50).regex(/^[A-Z0-9]+$/),
      limit: z.number().int().min(1).max(50).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const limit = data.limit ?? 25;

    // Try to join the channel if bot isn't a member (best-effort, ignore errors)
    try {
      await slackFetch("conversations.join", `channel=${data.channelId}`);
    } catch {
      // join may fail (missing scope, private channel) — handled below
    }

    let history: any;
    try {
      history = await slackFetch(
        "conversations.history",
        `channel=${data.channelId}&limit=${limit}`,
      );
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("not_in_channel") || msg.includes("channel_not_found")) {
        return { messages: [], needsInvite: true as const };
      }
      throw err;
    }


    // Build user map for IDs referenced in messages
    const userIds = new Set<string>();
    for (const m of history.messages ?? []) {
      if (m.user) userIds.add(m.user);
      const refs = (m.text ?? "").matchAll(/<@([A-Z0-9]+)>/g);
      for (const r of refs) userIds.add(r[1]);
    }

    const users: Record<string, { name: string; avatar?: string }> = {};
    await Promise.all(
      Array.from(userIds).map(async (id) => {
        try {
          const u = await slackFetch("users.info", `user=${id}`);
          const p = u.user?.profile ?? {};
          users[id] = {
            name: p.display_name || u.user?.real_name || u.user?.name || id,
            avatar: p.image_48 || p.image_72,
          };
        } catch {
          users[id] = { name: id };
        }
      }),
    );

    const expand = (text: string) =>
      (text ?? "")
        .replace(/<@([A-Z0-9]+)>/g, (_, id) => `@${users[id]?.name ?? id}`)
        .replace(/<#[A-Z0-9]+\|([^>]+)>/g, (_, n) => `#${n}`)
        .replace(/<(https?:[^|>]+)\|([^>]+)>/g, (_, _u, label) => label)
        .replace(/<(https?:[^>]+)>/g, (_, u) => u);

    const messages = (history.messages ?? [])
      .filter((m: any) => m.type === "message" && !m.subtype)
      .map((m: any) => ({
        ts: m.ts as string,
        userId: (m.user ?? m.bot_id ?? "unknown") as string,
        userName: users[m.user]?.name ?? m.username ?? "Slack",
        userAvatar: users[m.user]?.avatar,
        text: expand(m.text ?? ""),
        reactions: (m.reactions ?? []).map((r: any) => ({ name: r.name, count: r.count })),
      }))
      .reverse(); // oldest -> newest

    return { messages, needsInvite: false as const };
  });
