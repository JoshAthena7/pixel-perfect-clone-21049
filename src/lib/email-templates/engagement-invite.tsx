import * as React from "react";
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

export interface EngagementInviteProps {
  recipientName?: string;
  inviterName?: string;
  engagementName?: string;
  client?: string;
  roleLabel?: string;
  acceptUrl?: string;
}

const C = {
  bg: "#ffffff",
  text: "#0b1220",
  muted: "#475569",
  border: "#e2e8f0",
  card: "#f8fafc",
  accent: "#1B3B72",
  gold: "#C49A2A",
};

export function EngagementInvite({
  recipientName = "there",
  inviterName = "Your colleague",
  engagementName = "the engagement",
  client = "",
  roleLabel = "Leader",
  acceptUrl = "https://athenacommandcenter.com",
}: EngagementInviteProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${inviterName} invited you to ${engagementName} on Athena Command™`}</Preview>
      <Body style={{ backgroundColor: C.bg, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: C.text, margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "32px 24px" }}>
          <Text style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.gold, margin: 0, fontWeight: 700 }}>
            Athena Command™
          </Text>
          <Heading style={{ fontSize: 22, lineHeight: "30px", margin: "12px 0 8px", color: C.text }}>
            You've been invited to the Command Center
          </Heading>
          <Text style={{ fontSize: 14, color: C.muted, margin: "0 0 24px" }}>
            Hi {recipientName} — {inviterName} added you as <strong style={{ color: C.text }}>{roleLabel}</strong> on{" "}
            <strong style={{ color: C.text }}>{engagementName}</strong>{client ? ` (${client})` : ""}.
          </Text>

          <Section style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, margin: "0 0 24px" }}>
            <Text style={{ fontSize: 13, color: C.text, margin: "0 0 16px", lineHeight: "20px" }}>
              The Command Center is where this engagement's leadership tracks daily huddles, risks, escalations, client pulse, and decisions in one place. Click below to join.
            </Text>
            <Button
              href={acceptUrl}
              style={{
                backgroundColor: C.accent,
                color: "#ffffff",
                padding: "12px 22px",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Accept invitation
            </Button>
          </Section>

          <Text style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>
            Or copy this link into your browser:
          </Text>
          <Text style={{ fontSize: 12, color: C.accent, margin: 0, wordBreak: "break-all" }}>{acceptUrl}</Text>

          <Hr style={{ borderColor: C.border, margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 11, color: C.muted, margin: 0 }}>
            If you weren't expecting this invite, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const template = {
  component: EngagementInvite,
  subject: (data: Record<string, any>) =>
    `${data?.inviterName ?? "A colleague"} invited you to ${data?.engagementName ?? "an engagement"} — Athena`,
  displayName: "Engagement invitation",
  previewData: {
    recipientName: "Jane",
    inviterName: "Mark",
    engagementName: "Indiana Medicaid",
    client: "State of Indiana",
    roleLabel: "Engagement Quality Lead",
    acceptUrl: "https://athenacommandcenter.com/accept-invite?token=preview",
  },
} satisfies TemplateEntry;
