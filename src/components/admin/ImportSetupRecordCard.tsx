import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { importSetupRecord } from "@/lib/import-setup-record.functions";

type Props = {
  missionId: string;
  onImported?: () => void;
};

export function ImportSetupRecordCard({ missionId, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const importFn = useServerFn(importSetupRecord);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ count: number; fields: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".docx")) {
        throw new Error("Please upload a .docx file (Mission Setup Record).");
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("File is larger than 8 MB.");
      }
      const mammoth: any = await import("mammoth/mammoth.browser" as string);
      const buf = await file.arrayBuffer();
      const ext = await mammoth.extractRawText({ arrayBuffer: buf });
      const text = String(ext?.value ?? "").replace(/\r\n?/g, "\n").trim();
      if (text.length < 200) {
        throw new Error("Couldn't read enough text from this document.");
      }

      const res = await importFn({ data: { mission_id: missionId, doc_text: text.slice(0, 120_000) } });
      setResult({ count: res.fieldsUpdated, fields: res.fields });
      toast.success(`IRIS™ updated ${res.fieldsUpdated} setup field${res.fieldsUpdated === 1 ? "" : "s"}.`);
      onImported?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-light tracking-tight">
          Import Mission Setup Record
        </CardTitle>
        <CardDescription>
          Upload a completed ATLAS Mission Setup Record (.docx). IRIS™ will parse it and populate
          the fields below. Existing values for any field returned by IRIS™ will be overwritten;
          fields IRIS™ can't find are left untouched.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> IRIS™ parsing…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Upload .docx
              </>
            )}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>

        {result && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
            <div>
              Updated {result.count} field{result.count === 1 ? "" : "s"}:{" "}
              <span className="font-mono text-xs">{result.fields.join(", ") || "—"}</span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
