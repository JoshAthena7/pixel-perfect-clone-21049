import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Pencil, ExternalLink, Wand2, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ARCHIVABLE = ["submitted", "awarded", "not_awarded"];

export function MissionCardMenu({
  missionId,
  missionName,
  status,
  onEdit,
}: {
  missionId: string;
  missionName: string;
  status: string;
  onEdit: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const canArchive = ARCHIVABLE.includes(status);
  const canDelete = status === "setup";

  const archive = async () => {
    const { error } = await supabase.from("missions").update({ status: "archived" }).eq("id", missionId);
    if (error) return toast.error(error.message);
    toast.success("Mission archived.");
    qc.invalidateQueries({ queryKey: ["missions-list"] });
  };

  const del = async () => {
    const { error } = await supabase.from("missions").delete().eq("id", missionId);
    if (error) return toast.error(error.message);
    toast.success("Mission deleted.");
    qc.invalidateQueries({ queryKey: ["missions-list"] });
  };

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <div className="absolute top-3 right-3 z-10" onClick={stop}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mission actions"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => onEdit()}>
              <Pencil className="h-4 w-4 mr-2" /> Edit Mission
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                navigate({ to: "/olympus/missions/$missionId", params: { missionId } })
              }
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Open Mission
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                navigate({ to: "/olympus/wizard/$missionId", params: { missionId } })
              }
            >
              <Wand2 className="h-4 w-4 mr-2" /> Edit Setup
            </DropdownMenuItem>
            {(canArchive || canDelete) && <DropdownMenuSeparator />}
            {canArchive && (
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)} className="text-amber-400">
                <Archive className="h-4 w-4 mr-2" /> Archive Mission
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-red-400">
                <Trash2 className="h-4 w-4 mr-2" /> Delete Mission
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive mission?</AlertDialogTitle>
            <AlertDialogDescription>
              "{missionName}" will be hidden from active lists. Team access is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={archive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setTyped(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete mission?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the mission and all related data. Type the mission name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Type "{missionName}" to confirm:</Label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={typed !== missionName}
              onClick={del}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
