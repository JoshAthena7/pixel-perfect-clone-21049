import { useState } from "react";
import type { LibraryItem } from "@/lib/expertise.functions";

type Props = {
  library: LibraryItem[];
  existingCustomLabels: Set<string>; // lowercase
  onAdd: (label: string) => void;
  /** Called when user typed a label that already matches a library item. */
  onSuggestLibraryAdd: (libraryItem: LibraryItem) => void;
};

export function CustomExpertiseInput({ library, existingCustomLabels, onAdd, onSuggestLibraryAdd }: Props) {
  const [value, setValue] = useState("");
  const [suggestion, setSuggestion] = useState<LibraryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  function tryCommit() {
    const v = value.trim();
    setError(null);
    setSuggestion(null);
    if (v.length < 2) {
      if (v.length > 0) setError("Use at least 2 characters");
      return;
    }
    if (v.length > 40) {
      setError("Keep it under 40 characters");
      return;
    }
    const lc = v.toLowerCase();
    if (existingCustomLabels.has(lc)) {
      setError("Already in your list");
      return;
    }
    const match = library.find((l) => l.label.toLowerCase() === lc);
    if (match) {
      setSuggestion(match);
      return;
    }
    onAdd(v);
    setValue("");
  }

  return (
    <div>
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
          setSuggestion(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            tryCommit();
          }
        }}
        onBlur={() => value.trim() && tryCommit()}
        placeholder="Add expertise not listed above..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
      />
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Examples: Autism Services · Tribal Health · FWA · Pharmacy Benefit Management · Rare Disease
      </p>
      {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
      {suggestion && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span>
            Did you mean <strong>{suggestion.label}</strong>? It's in the structured library.
          </span>
          <button
            type="button"
            onClick={() => {
              onSuggestLibraryAdd(suggestion);
              setSuggestion(null);
              setValue("");
            }}
            className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
          >
            Add structured
          </button>
        </div>
      )}
    </div>
  );
}
