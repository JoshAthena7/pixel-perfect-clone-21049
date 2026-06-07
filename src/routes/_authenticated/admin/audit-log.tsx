// S-1: /admin/audit-log route — same implementation as /admin/audit
import { createFileRoute } from "@tanstack/react-router";
import { Route as AuditRoute } from "./audit";

export const Route = createFileRoute("/_authenticated/admin/audit-log")({
  component: AuditRoute.options.component!,
});
