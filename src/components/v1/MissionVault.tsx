import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listVault } from "@/lib/v1/mission.functions";
import { FileText, ExternalLink } from "lucide-react";
import { IrisBadge } from "./IrisBadge";

export function MissionVault() {
  const fetch = useServerFn(listVault);
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["v1-vault"],
    queryFn: () => fetch(),
  });

  const grouped = docs.reduce<Record<string, typeof docs>>((acc, d) => {
    const k = d.category ?? d.doc_type ?? "Other";
    (acc[k] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="px-8 py-8 max-w-[1100px] mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--v1-text)]">Mission Vault</h1>
      <p className="mt-2 text-sm text-[color:var(--v1-muted)]">NJ CSOC documents</p>

      {isLoading && <div className="mt-6 text-[color:var(--v1-muted)]">Scanning the vault…</div>}

      {!isLoading && docs.length === 0 && (
        <div className="mt-8 v1-card p-10 text-center text-[color:var(--v1-muted)]">
          No documents uploaded yet.
        </div>
      )}

      <div className="mt-6 space-y-6">
        {Object.entries(grouped).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--v1-muted)] mb-2">
              {cat} ({items.length})
            </h2>
            <div className="space-y-2">
              {items.map((d) => {
                const isTemplate = d.doc_type === "outline_template" || /template/i.test(d.title);
                return (
                  <div key={d.id} className="v1-card p-4 flex items-start gap-3">
                    <FileText className="h-5 w-5 text-[color:var(--v1-muted)] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[color:var(--v1-text)]">{d.title}</span>
                        {isTemplate && <IrisBadge>IRIS-Active</IrisBadge>}
                      </div>
                      {d.description && (
                        <p className="mt-1 text-xs text-[color:var(--v1-muted)] line-clamp-2">{d.description}</p>
                      )}
                      <div className="mt-1 text-[10px] text-[color:var(--v1-muted)]">
                        {d.uploaded_by_name && <>Uploaded by {d.uploaded_by_name} · </>}
                        {new Date(d.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {d.external_url && (
                      <a
                        href={d.external_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--v1-iris)] hover:underline shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
