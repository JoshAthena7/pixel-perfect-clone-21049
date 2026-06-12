// Re-export shim — canonical implementation lives in athena-insights.functions.ts.
// This file exists so imports can use the iris-insights.* name as well.
export {
  buildAthenaInsight,
  listMissionInsights,
  listMissionSections,
} from "@/lib/athena-insights.functions";
