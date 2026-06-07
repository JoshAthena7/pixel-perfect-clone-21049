// Tracks per-user, per-mission progress through the Mission Brief.
//
// Two milestones:
//   - opened    → user has visited the brief page at least once
//   - completed → user has scrolled to / read the whole brief
//
// Client-only, localStorage-backed. Acceptable to lose on storage clear.

const OPENED_PREFIX = "atlas.briefSeen";
const COMPLETED_PREFIX = "atlas.briefCompleted";

function openedKey(userId: string, missionId: string) {
  return `${OPENED_PREFIX}.${userId}.${missionId}`;
}
function completedKey(userId: string, missionId: string) {
  return `${COMPLETED_PREFIX}.${userId}.${missionId}`;
}

function read(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return true;
  }
}

function write(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* noop */
  }
}

export function hasSeenBrief(userId: string, missionId: string): boolean {
  return read(openedKey(userId, missionId));
}

export function markBriefSeen(userId: string, missionId: string): void {
  write(openedKey(userId, missionId));
}

export function hasCompletedBrief(userId: string, missionId: string): boolean {
  return read(completedKey(userId, missionId));
}

export function markBriefCompleted(userId: string, missionId: string): void {
  // Completing implies opened.
  write(openedKey(userId, missionId));
  write(completedKey(userId, missionId));
}

export type BriefProgress = "not-opened" | "opened" | "completed";

export function getBriefProgress(userId: string, missionId: string): BriefProgress {
  if (hasCompletedBrief(userId, missionId)) return "completed";
  if (hasSeenBrief(userId, missionId)) return "opened";
  return "not-opened";
}
