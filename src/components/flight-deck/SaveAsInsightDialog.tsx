/**
 * INSIGHT: Strategic observation with value beyond a single mission interaction.
 * Persistent. Mission-specific (mission_id set) or global (mission_id NULL).
 *
 * insight_type taxonomy (public.insights.insight_type):
 *   - win_pattern:       Something that consistently improves scoring or win probability.
 *   - loss_lesson:       Something that consistently hurts scoring or causes losses.
 *   - competitive_intel: Intelligence about specific competitors.
 *   - lesson:            Post-hoc learning from question or mission closeout
 *                        (written by LessonsLearnedDialog at closeout).
 *   - observation:       General strategic observation that doesn't fit above.
 *
 * Global insights (mission_id = NULL) form the Athena intelligence library.
 * Mission insights (mission_id set) are specific to one pursuit.
 *
 * Contrast with SIGNAL (src/lib/signals.ts): signals are ephemeral, frequent
 * observations tied to one mission. Insights are persistent strategy.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialContent: string;
  missionId: string | null;
};

const TYPE_OPTIONS = [
  { label: "Win Pattern", value: "win_pattern" },
  { label: "Loss Lesson", value: "loss_lesson" },
  { label: "Competitive Intel", value: "competitive_intel" },
  { label: "General Insight", value: "observation" },
] as const;

export function SaveAsInsightDialog({ open, onOpenChange, initialContent, missionId }: Props) {
  const [content, setContent] = useState(initialContent);
  const [type, setType] = useState<string>("observation");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  // Content is reset/initialized via the Dialog's onOpenChange below.

  const handleSave = async () => {
    const text = content.trim();
    if (!text) {
      toast.error("Insight content is required.");
      return;
    }
    setSaving(true);
    try {
      const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const { error } = await supabase.from("insights").insert({
        content: text,
        insight_type: type,
        mission_id: missionId,
        tags: tagArr.length ? tagArr : null,
        confidence: "med",
        expiry_flag: false,
        source: "thread_capture",
      });
      if (error) throw error;
      toast.success("Insight saved. IRIS will use this going forward.");
      onOpenChange(false);
      setContent("");
      setTags("");
      setType("observation");
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Failed to save insight.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setContent("");
          setTags("");
          setType("observation");
        } else {
          setContent(initialContent);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Save as Insight</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[12px]  tracking-wide text-muted-foreground">Content</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-[12px]  tracking-wide text-muted-foreground">Insight Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[12px]  tracking-wide text-muted-foreground">Tags (optional, comma-separated)</label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. evaluator, NJ, rate-setting"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Insight"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
