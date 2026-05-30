import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";

/**
 * Generates a simple non-PII device fingerprint based on stable browser traits.
 * Not cryptographic — just enough to recognize "same device" across logins.
 */
function deviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    `${screen.colorDepth}`,
    new Date().getTimezoneOffset().toString(),
  ];
  let hash = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

let lastTrackedUserId: string | null = null;

export async function trackLogin(userId: string, email: string | null) {
  if (lastTrackedUserId === userId) return; // avoid double-fire on re-renders
  lastTrackedUserId = userId;
  const fp = deviceFingerprint();
  const ua = navigator.userAgent;

  // Look up prior devices for this user
  const { data: prior } = await (supabase as any)
    .from("login_events")
    .select("device_fingerprint")
    .eq("user_id", userId)
    .limit(50);
  const knownFps = new Set((prior ?? []).map((r: any) => r.device_fingerprint));
  const isNewDevice = knownFps.size > 0 && !knownFps.has(fp);

  await (supabase as any).from("login_events").insert({
    user_id: userId,
    email,
    ip_address: null, // captured server-side via webhook if needed
    user_agent: ua,
    device_fingerprint: fp,
    is_new_device: isNewDevice,
  });

  if (isNewDevice) {
    // Log a high-visibility activity record. Leadership can subscribe / view this.
    // Get current engagement_id from session memberships; not engagement-scoped
    // login per se, so write to each engagement the user is a member of.
    const { data: memberships } = await supabase
      .from("engagement_members")
      .select("engagement_id, display_name")
      .eq("user_id", userId);
    for (const m of memberships ?? []) {
      logActivity({
        engagementId: m.engagement_id,
        userId,
        actorName: m.display_name ?? email ?? "Member",
        action: "new_device_login",
        metadata: { user_agent: ua, device_fingerprint: fp },
      });
    }
  } else {
    // standard login record
    const { data: memberships } = await supabase
      .from("engagement_members")
      .select("engagement_id, display_name")
      .eq("user_id", userId)
      .limit(1);
    const m = memberships?.[0];
    if (m) {
      logActivity({
        engagementId: m.engagement_id,
        userId,
        actorName: m.display_name ?? email ?? "Member",
        action: "login",
      });
    }
  }
}

export function resetLoginTracker() {
  lastTrackedUserId = null;
}
