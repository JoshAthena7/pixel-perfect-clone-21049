import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, FileText, LinkIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/writer/intel-library")({
  head: () => ({ meta: [{ title: "Intel Library — Writer Portal" }] }),
  component: WriterIntel,
});

function WriterIntel() {
  const { engagement } = useEngagement();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("intel_documents")
      .select("*")
      .eq("engagement_id", engagement.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, [engagement?.id]);

  async function open(d: any) {
    if (d.url) return window.open(d.url, "_blank", "noopener");
    if (d.file_path) {
      const { data, error } = await supabase.storage.from("intel-files").createSignedUrl(d.file_path, 300);
      if (error || !data) return toast.error("Could not open file");
      window.open(data.signedUrl, "_blank", "noopener");
    }
  }

  const term = q.toLowerCase().trim();
  const visible = !term
    ? items
    : items.filter((d) =>
        [d.name, d.category, d.notes].some((v) => (v || "").toLowerCase().includes(term)),
      );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Intel Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search for documents, RFP excerpts, and shared references.</p>
      </div>
      <Input placeholder="Search by keyword…" value={q} onChange={(e) => setQ(e.target.value)} />
      {visible.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No matching documents.</Card>
      ) : (
        <div className="space-y-3">
          {visible.map((d) => (
            <Card key={d.id} className="border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {d.url ? <LinkIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    <span className="truncate">{d.name}</span>
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{d.category}</div>
                  {d.notes && <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{d.notes}</div>}
                </div>
                <Button size="sm" variant="outline" onClick={() => open(d)}>
                  {d.url ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">{d.url ? "Open" : "Download"}</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
