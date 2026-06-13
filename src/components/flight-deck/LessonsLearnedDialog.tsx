import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  questionId: string | null;
  onClosed?: () => void;
};

export function LessonsLearnedDialog({ open, onOpenChange, missionId, questionId, onClosed }: Props) {
  const [worked, setWorked] = useState("");
  const [didnt, setDidnt] = useState("");
  const [advice, setAdvice] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setWorked("");
    setDidnt("");
    setAdvice("");
  };

  const closeQuestion = async () => {
    if (!questionId) return;
    const { error } = await supabase
      .from("questions")
      .update({ status: "complete" })
      .eq("id", questionId);
    if (error) {
      console.error(error);
      toast.error("Could not mark question complete.");
      return false;
    }
    return true;
  };

  const handleSkip = async () => {
    setSaving(true);
    const ok = await closeQuestion();
    setSaving(false);
    if (ok) {
      toast.success("Question closed.");
      reset();
      onOpenChange(false);
      onClosed?.();
    }
  };

  const handleSave = async () => {
    if (!missionId) {
      toast.error("Mission context missing.");
      return;
    }
    setSaving(true);
    try {
      const fields = [
        { label: "what_worked", value: worked.trim() },
        { label: "what_didnt", value: didnt.trim() },
        { label: "advice", value: advice.trim() },
      ].filter((f) => f.value);

      if (fields.length > 0) {
        const rows = fields.map((f) => ({
          content: f.value,
          insight_type: "lesson",
          mission_id: missionId,
          source: "question_closeout",
          tags: ["lessons_learned", "question_closeout", f.label],
          confidence: "med",
          expiry_flag: false,
        }));
        const { error } = await supabase.from("insights").insert(rows);
        if (error) throw error;
      }

      const ok = await closeQuestion();
      if (ok) {
        toast.success(
          fields.length
            ? "Lessons saved. IRIS will learn from this."
            : "Question closed.",
        );
        reset();
        onOpenChange(false);
        onClosed?.();
      }
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Failed to save lessons.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Lessons Learned</DialogTitle>
          <DialogDescription>Optional — takes 30 seconds. Helps IRIS sharpen future briefs.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field
            label="What worked well on this question?"
            value={worked}
            onChange={setWorked}
          />
          <Field
            label="What didn't work, or what would you do differently?"
            value={didnt}
            onChange={setDidnt}
          />
          <Field
            label="Advice for a writer answering a similar question in the future?"
            value={advice}
            onChange={setAdvice}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip} disabled={saving}>
            Skip &amp; Close
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save & Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[12px] text-foreground/80">{label}</label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="mt-1"
      />
    </div>
  );
}
