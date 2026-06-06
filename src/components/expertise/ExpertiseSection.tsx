import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  getExpertiseLibrary,
  getUserExpertise,
  setUserExpertise,
  type LibraryItem,
  type UserExpertise,
} from "@/lib/expertise.functions";
import { ExpertiseSelector } from "./ExpertiseSelector";
import { ExpertiseChips, type DisplayChip } from "./ExpertiseChips";
import { CustomExpertiseInput } from "./CustomExpertiseInput";
import { ExpertiseCompletenessBar } from "./ExpertiseCompletenessBar";

type Props = {
  userId: string;
};

const customKey = (label: string) => `custom:${label.toLowerCase()}`;

export function ExpertiseSection({ userId }: Props) {
  const qc = useQueryClient();
  const getLibrary = useServerFn(getExpertiseLibrary);
  const getUserExp = useServerFn(getUserExpertise);
  const saveUserExp = useServerFn(setUserExpertise);

  const { data: library = [] } = useQuery({
    queryKey: ["expertise-library"],
    queryFn: () => getLibrary(),
    staleTime: 5 * 60_000,
  });

  const { data: serverExp } = useQuery({
    queryKey: ["user-expertise", userId],
    queryFn: () => getUserExp({ data: { userId } }),
  });

  const [chips, setChips] = useState<DisplayChip[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  // Hydrate local state from server once
  useEffect(() => {
    if (!serverExp || initialized.current) return;
    initialized.current = true;
    const merged: DisplayChip[] = [];
    for (const s of serverExp.structured) {
      merged.push({
        key: s.expertise_id,
        label: s.label,
        category: s.category,
        isPrimary: s.is_primary,
      });
    }
    for (const c of serverExp.custom) {
      merged.push({
        key: customKey(c.custom_label),
        label: c.custom_label,
        category: null,
        isPrimary: c.is_primary,
      });
    }
    // sort by display_order from server
    const orderMap = new Map<string, number>();
    serverExp.structured.forEach((s) => orderMap.set(s.expertise_id, s.display_order));
    serverExp.custom.forEach((c) => orderMap.set(customKey(c.custom_label), c.display_order));
    merged.sort((a, b) => (orderMap.get(a.key) ?? 0) - (orderMap.get(b.key) ?? 0));
    setChips(merged);
  }, [serverExp]);

  const libraryById = useMemo(() => {
    const m = new Map<string, LibraryItem>();
    for (const i of library) m.set(i.id, i);
    return m;
  }, [library]);

  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of chips) if (c.category) s.add(c.key);
    return s;
  }, [chips]);

  const existingCustomLabels = useMemo(() => {
    const s = new Set<string>();
    for (const c of chips) if (!c.category) s.add(c.label.toLowerCase());
    return s;
  }, [chips]);

  // Debounced auto-save
  const saveTimer = useRef<number | null>(null);
  function scheduleSave(next: DisplayChip[]) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(next), 600);
  }

  async function persist(state: DisplayChip[]) {
    setSaving(true);
    try {
      const items = state.map((c, i) => ({
        expertise_id: c.category ? c.key : null,
        custom_label: c.category ? null : c.label,
        is_primary: c.isPrimary,
        display_order: i,
      }));
      await saveUserExp({ data: { items } });
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ["user-expertise", userId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save expertise");
    } finally {
      setSaving(false);
    }
  }

  function handleToggleLibrary(id: string) {
    setChips((prev) => {
      const exists = prev.find((c) => c.key === id);
      let next: DisplayChip[];
      if (exists) {
        next = prev.filter((c) => c.key !== id);
      } else {
        const item = libraryById.get(id);
        if (!item) return prev;
        next = [
          ...prev,
          { key: item.id, label: item.label, category: item.category, isPrimary: false },
        ];
      }
      scheduleSave(next);
      return next;
    });
  }

  function handleAddCustom(label: string) {
    setChips((prev) => {
      const next = [...prev, { key: customKey(label), label, category: null, isPrimary: false }];
      scheduleSave(next);
      return next;
    });
  }

  function handleRemove(key: string) {
    setChips((prev) => {
      const next = prev.filter((c) => c.key !== key);
      scheduleSave(next);
      return next;
    });
  }

  function handleTogglePrimary(key: string) {
    setChips((prev) => {
      const next = prev.map((c) => (c.key === key ? { ...c, isPrimary: !c.isPrimary } : c));
      const primaryCount = next.filter((c) => c.isPrimary).length;
      if (primaryCount > 5) {
        toast.error("You've selected 5 primary areas — the maximum. Remove one to add another.");
        return prev;
      }
      scheduleSave(next);
      return next;
    });
  }

  function handleReorder(newOrder: DisplayChip[]) {
    setChips(newOrder);
    scheduleSave(newOrder);
  }

  const primaryCount = chips.filter((c) => c.isPrimary).length;

  return (
    <section className="space-y-4">
      <header>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Expertise & Background</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select the programs, functions, and markets you work in. Mark up to 5 as primary to help
              ATLAS match you to missions.
            </p>
          </div>
          <SaveIndicator saving={saving} savedAt={savedAt} />
        </div>
      </header>

      <ExpertiseSelector library={library} selectedIds={selectedIds} onToggle={handleToggleLibrary} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your Expertise
          </span>
          <span className="text-[11px] text-muted-foreground">{primaryCount} of 5 primary selected</span>
        </div>
        <ExpertiseChips
          chips={chips}
          onReorder={handleReorder}
          onRemove={handleRemove}
          onTogglePrimary={handleTogglePrimary}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Tip: Click the colored dot on any tag to mark it as primary.
        </p>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Additional Expertise
        </div>
        <CustomExpertiseInput
          library={library}
          existingCustomLabels={existingCustomLabels}
          onAdd={handleAddCustom}
          onSuggestLibraryAdd={(item) => handleToggleLibrary(item.id)}
        />
      </div>

      <ExpertiseCompletenessBar chips={chips} library={library} />

      {chips.length === 0 && <FirstTimeNudge />}
    </section>
  );
}

function SaveIndicator({ saving, savedAt }: { saving: boolean; savedAt: number | null }) {
  if (saving) return <span className="text-[11px] text-muted-foreground">Saving…</span>;
  if (savedAt) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-500">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  }
  return null;
}

function FirstTimeNudge() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/10 p-4 text-center">
      <p className="text-sm font-medium text-foreground">Tell ATLAS what you know.</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        Your expertise profile helps IRIS match you to the right missions, find the right collaborators,
        and surface the most relevant intelligence. Takes about 2 minutes.
      </p>
    </div>
  );
}
