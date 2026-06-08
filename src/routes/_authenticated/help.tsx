import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

const PREVIEW_URL =
  "https://id-preview--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app";
const PUBLISHED_URL = "https://athenacommandcenter.com";

export const Route = createFileRoute("/_authenticated/help")({
  component: HelpSettingsPage,
});

function HelpSettingsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (url: string, key: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Help &amp; Settings
          </h1>
          <p className="text-muted-foreground">
            Quick access to the most current versions of the app.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-medium">Latest Preview URL</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Auto-updates with every change. Requires a Lovable login (workspace
              members only).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">
              {PREVIEW_URL}
            </code>
            <button
              onClick={() => copy(PREVIEW_URL, "preview")}
              className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              {copied === "preview" ? "Copied" : "Copy"}
            </button>
            <a
              href={PREVIEW_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Open
            </a>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">How to access:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click "Open" or paste the URL into your browser.</li>
              <li>Sign in with your Lovable workspace account if prompted.</li>
              <li>
                To share with someone outside the workspace, use Lovable's
                Share → Share preview (7-day public link).
              </li>
            </ol>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-medium">Published (Live) URL</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Public production site. Only updates when Publish → Update is
              clicked in Lovable.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">
              {PUBLISHED_URL}
            </code>
            <button
              onClick={() => copy(PUBLISHED_URL, "published")}
              className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              {copied === "published" ? "Copied" : "Copy"}
            </button>
            <a
              href={PUBLISHED_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Open
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
