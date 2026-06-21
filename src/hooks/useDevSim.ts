/**
 * useDevSim — central read-side of the ATLAS Developer Tools.
 *
 * The DevToolsPanel writes sessionStorage flags and dispatches
 * `atlas-devsim-changed`. Every consumer surface (Flight Deck empty state,
 * War Room empty ATC, Briefing room read-only / empty / access-denied,
 * IRIS Control pipeline error, Wizard step jumps, Mission Setup empty,
 * modal pre-fill state, etc.) calls this hook to know whether to render
 * a simulated view instead of the real one.
 *
 * RLS / server fns are always called as the real admin user — simulation
 * is visual-only.
 */
import { useEffect, useSyncExternalStore } from "react";

export const DEVSIM_EVENT = "atlas-devsim-changed";

export type SimRole =
  | "engagement_lead"
  | "project_manager"
  | "writer"
  | "sme"
  | "reviewer";

export type SimModalState =
  | "blocked"
  | "sme"
  | "results"
  | "evaluator"
  | null;

export type DevSimState = {
  /** Role to render UI as. null = real role (Admin / DB role). */
  simulatedRole: SimRole | null;
  readonly: boolean;
  emptyMission: boolean;
  emptyFlightDeck: boolean;
  emptyBriefing: boolean;
  missionSetup: boolean;
  /** Wizard step override (1..9). null = no override. */
  wizardStep: number | null;
  /** Wizard step-1 sub-variant: "empty" | "ready" | null */
  wizardVariant: "empty" | "ready" | null;
  accessDenied: boolean;
  pipelineError: boolean;
  modalState: SimModalState;
  /** True when ANY simulation flag is on — handy for a "simulating" badge. */
  anyActive: boolean;
};

const ROLE_LABEL_TO_KEY: Record<string, SimRole> = {
  "Engagement Lead": "engagement_lead",
  "Project Manager": "project_manager",
  Writer: "writer",
  SME: "sme",
  Reviewer: "reviewer",
};

function read(): DevSimState {
  if (typeof window === "undefined") {
    return {
      simulatedRole: null,
      readonly: false,
      emptyMission: false,
      emptyFlightDeck: false,
      emptyBriefing: false,
      missionSetup: false,
      wizardStep: null,
      wizardVariant: null,
      accessDenied: false,
      pipelineError: false,
      modalState: null,
      anyActive: false,
    };
  }
  let raw = "";
  try {
    raw = sessionStorage.getItem("atlas_preview_role") ?? "";
  } catch {}
  const simulatedRole = ROLE_LABEL_TO_KEY[raw] ?? null;

  const get = (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  };

  const wizardRaw = get("atlas_sim_wizard");
  let wizardStep: number | null = null;
  let wizardVariant: "empty" | "ready" | null = null;
  if (wizardRaw) {
    const [stepStr, variant] = wizardRaw.split(":");
    const n = Number.parseInt(stepStr, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 9) wizardStep = n;
    if (variant === "empty" || variant === "ready") wizardVariant = variant;
  }

  const modalRaw = get("atlas_dev_modal_state");
  const modalState =
    modalRaw === "blocked" || modalRaw === "sme" || modalRaw === "results" || modalRaw === "evaluator"
      ? (modalRaw as SimModalState)
      : null;

  const state: Omit<DevSimState, "anyActive"> = {
    simulatedRole,
    readonly: get("atlas_sim_readonly") === "1",
    emptyMission: get("atlas_sim_empty_mission") === "1",
    emptyFlightDeck: get("atlas_sim_empty_flightdeck") === "1",
    emptyBriefing: get("atlas_sim_empty_briefing") === "1",
    missionSetup: get("atlas_sim_mission_setup") === "1",
    wizardStep,
    wizardVariant,
    accessDenied: get("atlas_sim_access_denied") === "1",
    pipelineError: get("atlas_sim_pipeline_error") === "1",
    modalState,
  };
  const anyActive =
    !!state.simulatedRole ||
    state.readonly ||
    state.emptyMission ||
    state.emptyFlightDeck ||
    state.emptyBriefing ||
    state.missionSetup ||
    state.wizardStep !== null ||
    state.accessDenied ||
    state.pipelineError ||
    state.modalState !== null;
  return { ...state, anyActive };
}

// Cache the snapshot so useSyncExternalStore gets a stable reference between
// renders when nothing has changed — otherwise it re-renders forever.
let cached: DevSimState = read();
let cachedSig = JSON.stringify(cached);

function getSnapshot(): DevSimState {
  return cached;
}

function refresh() {
  const next = read();
  const sig = JSON.stringify(next);
  if (sig !== cachedSig) {
    cached = next;
    cachedSig = sig;
  }
}

function subscribe(cb: () => void) {
  const handler = () => {
    refresh();
    cb();
  };
  window.addEventListener(DEVSIM_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(DEVSIM_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

const SSR_SNAPSHOT = read();
function getServerSnapshot(): DevSimState {
  return SSR_SNAPSHOT;
}

export function useDevSim(): DevSimState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Re-read sessionStorage and notify subscribers. Call after any write
 * the panel performs (set flag, set role, reset). */
export function notifyDevSimChange() {
  if (typeof window === "undefined") return;
  refresh();
  window.dispatchEvent(new CustomEvent(DEVSIM_EVENT));
}

/** Imperative read for non-React code (e.g. server-fn-less helpers). */
export function getDevSim(): DevSimState {
  refresh();
  return cached;
}

/** Convenience: imperatively listen for one of the animation events
 * dispatched by the panel (whisper / scan / iris-loading). */
export function useDevSimAnimation(
  event: "atlas-dev-whisper" | "atlas-dev-scan" | "atlas-dev-iris-loading",
  handler: (detail: any) => void,
) {
  useEffect(() => {
    const h = (e: Event) => handler(((e as CustomEvent).detail ?? {}) as any);
    window.addEventListener(event, h);
    return () => window.removeEventListener(event, h);
  }, [event, handler]);
}
