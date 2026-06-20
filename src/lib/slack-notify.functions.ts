/**
 * Server-side Slack delivery. Webhook URL lives ONLY in server env
 * (SLACK_WEBHOOK_URL — no VITE_ prefix). The client calls these server
 * functions; the URL never reaches the browser bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NotePayload = z.object({
  noteType: z.enum(["decision", "question", "blocker", "insight"]),
  content: z.string().min(1).max(2000),
  questionNumber: z.string().nullable().optional(),
  questionTitle: z.string().nullable().optional(),
});

export const isSlackConfigured = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: !!process.env.SLACK_WEBHOOK_URL };
});

export const postNoteToSlack = createServerFn({ method: "POST" })
  .inputValidator((d) => NotePayload.parse(d))
  .handler(async ({ data }) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return { ok: false, reason: "not_configured" as const };

    const typeEmoji = { decision: "📋", question: "❓", blocker: "🚧", insight: "💡" } as const;
    const emoji = typeEmoji[data.noteType];
    const label = data.noteType.toUpperCase();
    const qNum = data.questionNumber ?? "?";
    const title = data.questionTitle ?? "";

    const payload = {
      text: `${emoji} ATLAS · Q${qNum} · ${label}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `${emoji} ${label} — Q${qNum}` } },
        { type: "section", text: { type: "mrkdwn", text: `*${title}*\n${data.content}` } },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `Posted in ATLAS · ${new Date().toLocaleString()}` }],
        },
        ...(data.noteType === "question" || data.noteType === "blocker"
          ? [
              {
                type: "section",
                text: { type: "mrkdwn", text: `_This note requires a response. Reply in ATLAS._` },
              },
            ]
          : []),
      ],
    };

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { ok: res.ok, reason: res.ok ? null : (`http_${res.status}` as const) };
    } catch (err) {
      console.error("[slack-notify] post failed", err);
      return { ok: false, reason: "fetch_failed" as const };
    }
  });
