export type IrisState = "stable" | "attention" | "intervention" | "neutral";
export type IrisOutputType = "signal" | "alert" | "insight" | "recommendation";
export const IRIS_STATE_COLOR: Record<IrisState, string> = {
  stable: "#22c55e", attention: "#f59e0b", intervention: "#ef4444", neutral: "#556070",
};
export const IRIS_TYPE_LABEL: Record<IrisOutputType, string> = {
  signal: "Signal", alert: "Alert", insight: "Insight", recommendation: "Recommendation",
};
export const IRIS_TYPE_COLOR: Record<IrisOutputType, string> = {
  signal: "#60a5fa", alert: "#ef4444", insight: "#C49A2A", recommendation: "#22c55e",
};
