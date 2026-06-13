import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { closeMissionAndUpdateIntelligence } from "@/lib/iris-mission-close.functions";

const OUTCOMES = [
  { value: "win", label: "Win" },
  { value: "loss", label: "Loss" },
  { value: "no_award", label: "No Award" },
  { value: "cancelled", label: "Cancelled" },
  { value: "protest_pending", label: "Protest — Pending" },
  { value: "protest_sustained", label: "Protest — Sustained" },
  { value: "protest_denied", label: "Protest — Denied" },
] as const;

type OutcomeValue = (typeof OUTCOMES)[number]["value"];

export function CloseMissionDialog({
  missionId,
  open,
  onOpenChange,
}: {
  missionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const closeFn = useServerFn(closeMissionAndUpdateIntelligence);

  const [outcome, setOutcome] = useState<OutcomeValue>("win");
  const [awardedTo, setAwardedTo] = useState("");
  const [awardValue, setAwardValue] = useState("");
  const [awardDate, setAwardDate] = useState("");
  const [finalScore, setFinalScore] = useState("");
  const [finalRank, setFinalRank] = useState("");
  const [totalOfferors, setTotalOfferors] = useState("");
  const [debriefReceived, setDebriefReceived] = useState(false);
  const [debriefNotes, setDebriefNotes] = useState("");
  const [oralsHeld, setOralsHeld] = useState(false);
  const [oralsNotes, setOralsNotes] = useState("");
  const [bafoRequested, setBafoRequested] = useState(false);
  const [bafoNotes, setBafoNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const requiresAwarded = outcome === "loss" || outcome === "no_award";
      if (requiresAwarded && !awardedTo.trim())
        throw new Error("'Awarded To' is required for this outcome.");
      if (outcome === "win" && !awardValue.trim())
        throw new Error("'Award Value' is required for a Win.");

      return closeFn({
        data: {
          mission_id: missionId,
          outcome,
          awarded_to: awardedTo.trim() || null,
          award_value: awardValue ? Number(awardValue) : null,
          award_date: awardDate || null,
          final_score_received: finalScore ? Number(finalScore) : null,
          final_rank: finalRank ? Number(finalRank) : null,
          total_offerors: totalOfferors ? Number(totalOfferors) : null,
          debrief_received: debriefReceived,
          debrief_notes: debriefReceived ? debriefNotes : null,
          orals_held: oralsHeld,
          orals_notes: oralsHeld ? oralsNotes : null,
          bafo_requested: bafoRequested,
          bafo_notes: bafoRequested ? bafoNotes : null,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(res.message ?? "Mission closed.");
      qc.invalidateQueries({ queryKey: ["mission-outcome", missionId] });
      qc.invalidateQueries({ queryKey: ["briefing"] });
      qc.invalidateQueries({ queryKey: ["mission-switcher"] });
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not close mission.");
    },
  });

  const showAwarded = outcome === "loss" || outcome === "no_award" || outcome === "win";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close This Mission — Record the Outcome</DialogTitle>
          <DialogDescription>
            This locks the mission and triggers IRIS to learn lessons, update competitor
            intelligence, and add a state signal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label className="mb-2 block">Outcome *</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as OutcomeValue)}
              className="grid grid-cols-2 gap-2"
            >
              {OUTCOMES.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 cursor-pointer hover:bg-surface/60"
                >
                  <RadioGroupItem value={o.value} id={`out-${o.value}`} />
                  <span className="text-sm">{o.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {showAwarded && (
            <div>
              <Label htmlFor="awarded-to">
                Awarded To {(outcome === "loss" || outcome === "no_award") && "*"}
              </Label>
              <Input
                id="awarded-to"
                value={awardedTo}
                onChange={(e) => setAwardedTo(e.target.value)}
                placeholder="Who won the contract?"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="award-value">
                Award Value (USD) {outcome === "win" && "*"}
              </Label>
              <Input
                id="award-value"
                type="number"
                value={awardValue}
                onChange={(e) => setAwardValue(e.target.value)}
                placeholder="e.g. 12500000"
              />
            </div>
            <div>
              <Label htmlFor="award-date">Award Date</Label>
              <Input
                id="award-date"
                type="date"
                value={awardDate}
                onChange={(e) => setAwardDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="final-score">Our Final Score</Label>
              <Input
                id="final-score"
                type="number"
                step="0.01"
                value={finalScore}
                onChange={(e) => setFinalScore(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="final-rank">Our Final Rank</Label>
              <Input
                id="final-rank"
                type="number"
                value={finalRank}
                onChange={(e) => setFinalRank(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div>
              <Label htmlFor="total-offerors">Total Offerors</Label>
              <Input
                id="total-offerors"
                type="number"
                value={totalOfferors}
                onChange={(e) => setTotalOfferors(e.target.value)}
                placeholder="e.g. 4"
              />
            </div>
          </div>

          <ToggleSection
            label="Debrief Received?"
            value={debriefReceived}
            onChange={setDebriefReceived}
            notes={debriefNotes}
            onNotesChange={setDebriefNotes}
            placeholder="Key quotes, scores by factor, strengths/weaknesses cited..."
          />
          <ToggleSection
            label="Orals Held?"
            value={oralsHeld}
            onChange={setOralsHeld}
            notes={oralsNotes}
            onNotesChange={setOralsNotes}
            placeholder="Who presented, what questions came up, evaluator reactions..."
          />
          <ToggleSection
            label="BAFO Requested?"
            value={bafoRequested}
            onChange={setBafoRequested}
            notes={bafoNotes}
            onNotesChange={setBafoNotes}
            placeholder="What changed in our BAFO and why..."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Outcome & Update IRIS Intelligence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleSection({
  label,
  value,
  onChange,
  notes,
  onNotesChange,
  placeholder,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Switch checked={value} onCheckedChange={onChange} />
      </div>
      {value && (
        <Textarea
          className="mt-2"
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
