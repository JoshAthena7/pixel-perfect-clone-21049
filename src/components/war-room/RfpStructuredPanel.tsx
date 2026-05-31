import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

type RfpData = {
  issuing_agency: string | null;
  contract_type: string | null;
  contract_value: string | null;
  contract_term: string | null;
  evaluation_method: string | null;
  incumbent: string | null;
  compliance_notes: string | null;
};

type Criterion = {
  id: string;
  criterion: string;
  weight: number | null;
  notes: string | null;
  sort_order: number;
};

const FIELDS: { key: keyof RfpData; label: string; multiline?: boolean }[] = [
  { key: "issuing_agency", label: "Issuing Agency" },
  { key: "contract_type", label: "Contract Type" },
  { key: "contract_value", label: "Contract Value" },
  { key: "contract_term", label: "Contract Term" },
  { key: "evaluation_method", label: "Evaluation Method" },
  { key: "incumbent", label: "Incumbent" },
  { key: "compliance_notes", label: "Compliance Notes", multiline: true },
];

const EMPTY: RfpData = {
  issuing_agency: "", contract_type: "", contract_value: "", contract_term: "",
  evaluation_method: "", incumbent: "", compliance_notes: "",
};

export function RfpStructuredPanel({ engagementId, canEdit }: { engagementId: string; canEdit: boolean }) {
  const [data, setData] = useState<RfpData>(EMPTY);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const initialised = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: row }, { data: rows }] = await Promise.all([
      supabase.from("engagement_rfp_data").select("*").eq("engagement_id", engagementId).maybeSingle(),
      supabase.from("rfp_evaluation_criteria").select("id, criterion, weight, notes, sort_order")
        .eq("engagement_id", engagementId).order("sort_order"),
    ]);
    if (row) {
      setData({
        issuing_agency: row.issuing_agency ?? "",
        contract_type: row.contract_type ?? "",
        contract_value: row.contract_value ?? "",
        contract_term: row.contract_term ?? "",
        evaluation_method: row.evaluation_method ?? "",
        incumbent: row.incumbent ?? "",
        compliance_notes: row.compliance_notes ?? "",
      });
    }
    setCriteria((rows ?? []) as Criterion[]);
    initialised.current = true;
    setLoading(false);
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  async function saveField(key: keyof RfpData, value: string) {
    if (!canEdit) return;
    setSavingField(key);
    const { data: u } = await supabase.auth.getUser();
    const displayName = u.user?.user_metadata?.display_name ?? u.user?.email ?? null;
    const payload: any = {
      engagement_id: engagementId,
      [key]: value || null,
      updated_by: u.user?.id,
      updated_by_name: displayName,
    };
    const { error } = await supabase
      .from("engagement_rfp_data")
      .upsert(payload, { onConflict: "engagement_id" });
    setSavingField(null);
    if (error) toast.error(`Save failed: ${error.message}`);
  }

  async function addCriterion() {
    if (!canEdit) return;
    const { data: u } = await supabase.auth.getUser();
    const { data: row, error } = await supabase.from("rfp_evaluation_criteria").insert({
      engagement_id: engagementId,
      criterion: "New criterion",
      sort_order: criteria.length,
      created_by: u.user?.id,
    }).select("id, criterion, weight, notes, sort_order").single();
    if (error) { toast.error(error.message); return; }
    setCriteria([...criteria, row as Criterion]);
  }

  async function updateCriterion(id: string, patch: Partial<Criterion>) {
    setCriteria(criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("rfp_evaluation_criteria").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function deleteCriterion(id: string) {
    setCriteria(criteria.filter((c) => c.id !== id));
    const { error } = await supabase.from("rfp_evaluation_criteria").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  return (
    <Card className="border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-4 w-4" /> RFP Intelligence — Structured
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {canEdit ? "Auto-saved on blur. Lead and PM editable; everyone else read-only." : "Read-only. Engagement leads maintain these fields."}
          </p>
        </div>
        {savingField && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.multiline ? "sm:col-span-2" : ""}>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{f.label}</label>
                {f.multiline ? (
                  <Textarea
                    rows={3}
                    defaultValue={data[f.key] ?? ""}
                    readOnly={!canEdit}
                    onBlur={(e) => { if (e.target.value !== (data[f.key] ?? "")) { setData({ ...data, [f.key]: e.target.value }); saveField(f.key, e.target.value); } }}
                    className="resize-none"
                  />
                ) : (
                  <Input
                    defaultValue={data[f.key] ?? ""}
                    readOnly={!canEdit}
                    onBlur={(e) => { if (e.target.value !== (data[f.key] ?? "")) { setData({ ...data, [f.key]: e.target.value }); saveField(f.key, e.target.value); } }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Evaluation Criteria</h3>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={addCriterion}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add criterion
                </Button>
              )}
            </div>

            {criteria.length === 0 ? (
              <p className="text-xs text-muted-foreground">No criteria captured yet.</p>
            ) : (
              <div className="space-y-2">
                {criteria.map((c) => (
                  <div key={c.id} className="grid grid-cols-12 gap-2 rounded-md border border-border bg-surface-hover/30 p-2">
                    <Input
                      className="col-span-5 h-8 text-xs"
                      defaultValue={c.criterion}
                      readOnly={!canEdit}
                      onBlur={(e) => { if (e.target.value !== c.criterion) updateCriterion(c.id, { criterion: e.target.value }); }}
                      placeholder="Criterion"
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      type="number"
                      step="0.01"
                      defaultValue={c.weight ?? ""}
                      readOnly={!canEdit}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== c.weight) updateCriterion(c.id, { weight: v });
                      }}
                      placeholder="Weight %"
                    />
                    <Input
                      className="col-span-4 h-8 text-xs"
                      defaultValue={c.notes ?? ""}
                      readOnly={!canEdit}
                      onBlur={(e) => { if (e.target.value !== (c.notes ?? "")) updateCriterion(c.id, { notes: e.target.value || null }); }}
                      placeholder="Notes"
                    />
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="col-span-1 h-8" onClick={() => deleteCriterion(c.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
