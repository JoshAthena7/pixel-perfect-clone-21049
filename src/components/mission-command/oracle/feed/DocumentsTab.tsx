/**
 * Feed ATLAS — Documents tab.
 *
 * Now powered by OracleDocumentChecklist: guided, status-aware uploads with
 * auto-tagging by checklist slot. The old 5-pill drop zone has been replaced.
 */
import { OracleDocumentChecklist } from "../checklist/OracleDocumentChecklist";

export function DocumentsTab({ missionId }: { missionId: string }) {
  return <OracleDocumentChecklist missionId={missionId} variant="drawer" />;
}
