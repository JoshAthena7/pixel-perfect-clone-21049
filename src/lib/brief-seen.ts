// Tracks whether the current user has ever opened the Mission Brief for a
// given mission. Used by FlightDeckResolver to send first-time users to the
// brief (orientation) and returning users to Flight Deck (operational home).
//
// Client-only, localStorage-backed. Acceptable to lose on storage clear —
// the worst case is one extra brief view.

const PREFIX = "atlas.briefSeen";

function key(userId: string, missionId: string) {
  return `${PREFIX}.${userId}.${missionId}`;
}

export function hasSeenBrief(userId: string, missionId: string): boolean {
  if (typeof window === "undefined") return true; // SSR: assume seen, no redirect
  try {
    return window.localStorage.getItem(key(userId, missionId)) === "1";
  } catch {
    return true;
  }
}

export function markBriefSeen(userId: string, missionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(userId, missionId), "1");
  } catch {
    /* noop */
  }
}
