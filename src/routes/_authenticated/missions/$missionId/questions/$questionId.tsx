import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/missions/$missionId/questions/$questionId")({
  component: () => (
    <div className="px-8 py-12 text-sm text-muted-foreground">
      Question Workspace UI ships in the next iteration.{" "}
      <Link to="/home" className="text-primary hover:underline">Back to Home</Link>
    </div>
  ),
});
