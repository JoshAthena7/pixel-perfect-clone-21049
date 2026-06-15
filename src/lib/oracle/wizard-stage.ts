/**
 * ORACLE wizard staging — temporary client-side store for Step 3/4 selections
 * until LaunchSequence persists them to oracle_engagement_config + oracle_beliefs.
 * Keyed by missionId in sessionStorage so the launch step can read what the
 * earlier steps confirmed without round-tripping every keystroke to the DB.
 */
import type { OracleWizardStaged } from "./types";

const keyFor = (missionId: string) => `oracle-wizard-stage:${missionId}`;

export function loadStaged(missionId: string): OracleWizardStaged {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(keyFor(missionId));
    return raw ? (JSON.parse(raw) as OracleWizardStaged) : {};
  } catch {
    return {};
  }
}

export function saveStaged(missionId: string, patch: Partial<OracleWizardStaged>): void {
  if (typeof window === "undefined") return;
  const cur = loadStaged(missionId);
  const next = { ...cur, ...patch };
  try {
    window.sessionStorage.setItem(keyFor(missionId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearStaged(missionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(keyFor(missionId));
  } catch {
    /* ignore */
  }
}
