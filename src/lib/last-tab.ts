// Per-mission last-visited tab persistence. Safe if localStorage is unavailable.
const KEY = (missionId: string) => `atlas_last_tab_${missionId}`;

export function getLastTab(missionId: string): string | null {
  try {
    return typeof window !== "undefined"
      ? window.localStorage.getItem(KEY(missionId))
      : null;
  } catch {
    return null;
  }
}

export function setLastTab(missionId: string, tab: string): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY(missionId), tab);
    }
  } catch {
    /* ignore */
  }
}
