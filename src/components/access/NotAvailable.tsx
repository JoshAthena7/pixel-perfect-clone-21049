import { Link } from "@tanstack/react-router";

/**
 * Shown when a user tries to view content they don't have permission for.
 * Per the Permissions spec: no error page, no name confirmation, no lock icon —
 * just the briefest possible "this doesn't exist for you" message.
 */
export function NotAvailable({
  kind = "mission",
}: {
  kind?: "mission" | "olympus" | "content";
}) {
  const message =
    kind === "mission"
      ? "This mission is not available."
      : kind === "olympus"
      ? "This area is not available."
      : "This content is not available.";

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link
        to="/home"
        className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        Back to Atrium
      </Link>
    </div>
  );
}
