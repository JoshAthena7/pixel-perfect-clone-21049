import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EVENT_CONFIG = {
  sos: { emoji: "🚨", color: "#dc2626", title: "SOS Alert" },
  heatmap_red: { emoji: "🔴", color: "#dc2626", title: "Heatmap turned Red" },
  broadcast: { emoji: "📣", color: "#2563eb", title: "New Broadcast" },
  risk: { emoji: "⚠️", color: "#ea580c", title: "New Risk" },
} as const;

type EventType = keyof typeof EVENT_CONFIG;

export const notifySlack = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      engagementId: z.string().uuid(),
      event: z.enum(["sos", "heatmap_red", "broadcast", "risk"]),
      title: z.string().min(1).max(300),
      body: z.string().max(2000).optional(),
      fields: z
        .array(z.object({ label: z.string(), value: z.string() }))
        .max(8)
        .optional(),
      author: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { data: eng } = await supabaseAdmin
      .from("engagements")
      .select("slack_webhook, name, client")
      .eq("id", data.engagementId)
      .maybeSingle();

    const webhook = eng?.slack_webhook?.trim();
    if (!webhook) return { sent: false, reason: "no_webhook" };

    const cfg = EVENT_CONFIG[data.event as EventType];
    const fieldLines =
      data.fields?.map((f) => `*${f.label}:* ${f.value}`).join("\n") ?? "";
    const text = [
      `${cfg.emoji} *${cfg.title}* — ${eng?.name ?? "Engagement"}${eng?.client ? ` (${eng.client})` : ""}`,
      `> ${data.title}`,
      data.body ? data.body : "",
      fieldLines,
      data.author ? `_— ${data.author}_` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          attachments: [
            {
              color: cfg.color,
              fallback: `${cfg.title}: ${data.title}`,
              title: data.title,
              text: data.body ?? "",
              fields:
                data.fields?.map((f) => ({
                  title: f.label,
                  value: f.value,
                  short: f.value.length < 40,
                })) ?? [],
              footer: `${eng?.name ?? ""}${data.author ? ` • ${data.author}` : ""}`,
              ts: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      });
      if (!res.ok) {
        return { sent: false, reason: `http_${res.status}` };
      }
      return { sent: true };
    } catch (e) {
      return { sent: false, reason: (e as Error).message };
    }
  });
