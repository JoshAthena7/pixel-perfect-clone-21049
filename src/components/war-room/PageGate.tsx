import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useEngagement } from "@/hooks/use-engagement";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import type { PageKey } from "@/lib/roles";
import { ROLE_LABELS, normalizeRole } from "@/lib/roles";

/**
 * Wrap a route's page content to enforce role-based access.
 * Renders `children` if the current role has at least read access to `page`.
 * Otherwise renders an inline "no access" notice with a back link.
 *
 * This is the read-gate; write-gates remain on individual action buttons
 * via `canEdit(page)` / the existing `canWrite` flag.
 */
export function PageGate({ page, children }: { page: PageKey; children: ReactNode }) {
  const { loading, engagement, can, role } = useEngagement();

  if (loading) return null;
  if (!engagement) return <>{children}</>; // engagement bootstrap surfaces handle their own empty state

  if (can(page)) return <>{children}</>;

  const normalized = normalizeRole(role);
  const label = normalized ? ROLE_LABELS[normalized] : "your role";

  return (
    <div className="mx-auto max-w-md p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Restricted area
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            This section isn't part of the {label} workspace on this mission. Ask an
            Engagement Lead to grant access if you need it.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/command">Back to Mission Control</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
