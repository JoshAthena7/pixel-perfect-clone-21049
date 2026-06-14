import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { saveMissionCloseDebrief } from "@/lib/mission-close-debrief.functions";

type OutcomeValue = "won" | "lost" | "no_award" | "cancelled";

const OUTCOMES: { value: OutcomeValue; label: string }[] = [
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "no_award", label: "No Award" },
  { value: "cancelled", label: "Cancelled" },
];

export function MissionCloseDebriefDialog({
  missionId,
  open,
  onOpenChange,
}: {
  missionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveMissionCloseDebrief);

  const [outcome, setOutcome] = useState<OutcomeValue>("won");
  const [outcomeFactor, setOutcomeFactor] = useState("");
  const [winThemeNotes, setWinThemeNotes] = useState("");
  const [competitorObs, setCompetitorObs] = useState("");
  const [topLesson, setTopLesson] = useState("");

  useEffect(() => {
    if (open) {
      setOutcome("won");
      setOutcomeFactor("");
      setWinThemeNotes("");
      setCompetitorObs("");
      setTopLesson("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () =>
      saveFn({
        data: {
          mission_id: missionId,
          outcome,
          outcome_factor: outcomeFactor.trim() || null,
          win_theme_notes: winThemeNotes.trim() || null,
          competitor_observations: competitorObs.trim() || null,
          top_lesson: topLesson.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Debrief saved. Thank you.");
      qc.invalidateQueries({ queryKey: ["mission-close-debrief-status", missionId] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      console.error("[mission-close-debrief] save failed", e);
      toast.error("Could not save debrief.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mission Debrief — Lock In What We Learned</DialogTitle>
          <DialogDescription>
            5 questions. Your answers train ATLAS for every future mission.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-2">
            <Label>Outcome</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as OutcomeValue)}
              className="grid grid-cols-2 gap-2"
            >
              {OUTCOMES.map((o) => (
                <label
                  key={o.value}
                  htmlFor={`outcome-${o.value}`}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/30"
                >
                  <RadioGroupItem id={`outcome-${o.value}`} value={o.value} />
                  <span className="text-sm">{o.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outcome-factor">
              What was the single biggest factor in the outcome?
            </Label>
            <Textarea
              id="outcome-factor"
              rows={3}
              value={outcomeFactor}
              onChange={(e) => setOutcomeFactor(e.target.value)}
              placeholder="What actually made the difference..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="win-theme-notes">
              Which win themes landed? Which didn't?
            </Label>
            <Textarea
              id="win-theme-notes"
              rows={3}
              value={winThemeNotes}
              onChange={(e) => setWinThemeNotes(e.target.value)}
              placeholder="What resonated with evaluators vs. what missed..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="competitor-obs">
              What did our competitors do that surprised us?
            </Label>
            <Textarea
              id="competitor-obs"
              rows={3}
              value={competitorObs}
              onChange={(e) => setCompetitorObs(e.target.value)}
              placeholder="Moves, pricing, teaming, messaging..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="top-lesson">
              Top lesson for the next team running a similar mission.
            </Label>
            <Textarea
              id="top-lesson"
              rows={3}
              value={topLesson}
              onChange={(e) => setTopLesson(e.target.value)}
              placeholder="If you could tell them one thing..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Skip for Now
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Save Debrief"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
