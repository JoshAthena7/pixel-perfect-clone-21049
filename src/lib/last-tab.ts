// Per-mission last-visited tab persistence. Safe if localStorage is unavailable.
import { TAB_REDIRECTS, isValidTab, type TabId } from "@/components/mission-command/MissionTabs";

const KEY = (missionId: string) => `atlas_last_tab_${missionId}`;

export function getLastTab(missionId: string): TabId | null {
  try {
    const raw =
      typeof window !== "undefined" ? window.localStorage.getItem(KEY(missionId)) : null;
    if (!raw) return null;
    if (isValidTab(raw)) return raw;
    const mapped = TAB_REDIRECTS[raw];
    if (mapped) return mapped.tab;
    return null;
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
