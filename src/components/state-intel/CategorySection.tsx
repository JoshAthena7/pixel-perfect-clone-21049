import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Download, Trash2, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  recordStateIntelDocument,
  archiveStateIntelDocument,
  deleteStateIntelDocument,
  getStateIntelDownloadUrl,
} from "@/lib/state-intel/state-intel.functions";
import type { StateIntelCategory } from "@/lib/state-intel/categories";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Doc {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  effective_date: string | null;
  uploaded_at: string;
  is_current: boolean;
  file_size: number | null;
  mime_type: string | null;
}

export function CategorySection({
  category,
  stateCode,
  documents,
}: {
  category: StateIntelCategory;
  stateCode: string;
  documents: Doc[];
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const record = useServerFn(recordStateIntelDocument);
  const archive = useServerFn(archiveStateIntelDocument);
  const del = useServerFn(deleteStateIntelDocument);
  const getUrl = useServerFn(getStateIntelDownloadUrl);
  const qc = useQueryClient();

  const current = documents.filter((d) => d.is_current);
  const archived = documents.filter((d) => !d.is_current);
  const hasCurrent = current.length > 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["state-intel-pack", stateCode] });

  const archiveMut = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Archived"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (d: Doc) => del({ data: { id: d.id, storagePath: d.storage_path } }),
    onSuccess: () => { invalidate(); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${stateCode}/${category.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("state-intel").upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (upErr) throw upErr;
        await record({
          data: {
            stateCode,
            category: category.id,
            title: file.name,
            storagePath: path,
            fileSize: file.size,
            mimeType: file.type || undefined,
          },
        });
      }
      toast.success(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}`);
      invalidate();
      setOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(d: Doc) {
    try {
      const { url } = await getUrl({ data: { storagePath: d.storage_path } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Could not generate link");
    }
  }

  const statusColor = hasCurrent ? "bg-green-500" : "bg-red-500/70";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] text-left"
      >
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        {open ? <ChevronDown className="w-4 h-4 text-white/50" /> : <ChevronRight className="w-4 h-4 text-white/50" />}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-white">{category.label}</div>
          <div className="text-[12px] text-white/45 truncate">{category.shortDescription}</div>
        </div>
        <span className="text-[12px] text-white/45">
          {current.length} current{archived.length > 0 ? ` · ${archived.length} archived` : ""}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          <div className="text-[12px] text-white/55">
            <span className="font-medium text-white/70">Examples to upload:</span>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {category.uploadExamples.map((ex) => <li key={ex}>{ex}</li>)}
            </ul>
          </div>

          {current.length > 0 && (
            <ul className="space-y-1">
              {current.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-[14px] bg-white/[0.02] rounded px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate">{d.title}</div>
                    <div className="text-[11px] text-white/45">
                      Uploaded {new Date(d.uploaded_at).toLocaleDateString()}
                      {d.file_size ? ` · ${(d.file_size / 1024).toFixed(0)} KB` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleDownload(d)} className="h-7 w-7 p-0">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => archiveMut.mutate(d.id)} className="h-7 w-7 p-0" title="Archive">
                    <Archive className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(d)} className="h-7 w-7 p-0 text-red-300 hover:text-red-200" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <label className="block">
            <div className="border border-dashed border-white/15 rounded-md py-4 px-3 text-center cursor-pointer hover:border-white/30 transition">
              <div className="text-[12px] text-white/60">
                {uploading ? "Uploading…" : "Drop files or click to upload"}
              </div>
            </div>
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>

          {archived.length > 0 && (
            <details className="text-[12px]">
              <summary className="text-white/45 cursor-pointer">Archived ({archived.length})</summary>
              <ul className="mt-2 space-y-1">
                {archived.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-1 text-white/55">
                    <span className="flex-1 truncate">{d.title}</span>
                    <button onClick={() => handleDownload(d)} className="hover:text-white">
                      <Download className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteMut.mutate(d)} className="hover:text-red-300">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
