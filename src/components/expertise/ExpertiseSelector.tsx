import { useMemo, useState, useRef, useEffect } from "react";
import { Search, X, ChevronDown, ChevronRight, Check } from "lucide-react";
import type { LibraryItem, ExpertiseCategory } from "@/lib/expertise.functions";
import { CATEGORY_META, CATEGORY_ORDER } from "./category-meta";

type Props = {
  library: LibraryItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
};

export function ExpertiseSelector({ library, selectedIds, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<ExpertiseCategory, boolean>>({
    "programs-populations": false,
    functional: true,
    "procurement-market": true,
    leadership: true,
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const grouped = useMemo(() => {
    const m: Record<ExpertiseCategory, LibraryItem[]> = {
      "programs-populations": [],
      functional: [],
      "procurement-market": [],
      leadership: [],
    };
    for (const item of library) m[item.category].push(item);
    return m;
  }, [library]);

  const searching = query.trim().length > 0;
  const filtered = useMemo(() => {
    if (!searching) return grouped;
    const q = query.toLowerCase();
    const m: Record<ExpertiseCategory, LibraryItem[]> = {
      "programs-populations": [],
      functional: [],
      "procurement-market": [],
      leadership: [],
    };
    for (const item of library) {
      if (item.label.toLowerCase().includes(q)) m[item.category].push(item);
    }
    return m;
  }, [library, query, searching, grouped]);

  const countSelectedInCat = (cat: ExpertiseCategory) =>
    grouped[cat].filter((i) => selectedIds.has(i.id)).length;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 focus-within:border-primary/50">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search or browse expertise areas..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1 max-h-[420px] w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {CATEGORY_ORDER.map((cat) => {
            const items = filtered[cat];
            const meta = CATEGORY_META[cat];
            const isCollapsed = !searching && collapsed[cat];

            if (searching && items.length === 0) return null;

            return (
              <div key={cat} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() =>
                    !searching && setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))
                  }
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {!searching && (
                      <span className="text-muted-foreground">
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    )}
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      {meta.label}
                    </span>
                  </div>
                  {!searching && countSelectedInCat(cat) > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {countSelectedInCat(cat)} selected
                    </span>
                  )}
                </button>

                {!isCollapsed && (
                  <ul className="pb-1">
                    {[...items]
                      .sort((a, b) => {
                        const sa = selectedIds.has(a.id) ? 0 : 1;
                        const sb = selectedIds.has(b.id) ? 0 : 1;
                        return sa - sb || a.sort_order - b.sort_order;
                      })
                      .map((item) => {
                        const selected = selectedIds.has(item.id);
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => onToggle(item.id)}
                              className={`flex w-full min-h-[36px] items-center justify-between px-5 py-1.5 text-left text-sm hover:bg-muted/60 ${
                                selected ? "text-foreground" : "text-foreground/85"
                              }`}
                            >
                              <span>
                                {searching ? highlight(item.label, query) : item.label}
                              </span>
                              {selected && (
                                <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                                  <Check className="h-3 w-3" /> selected
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            );
          })}

          {searching &&
            CATEGORY_ORDER.every((c) => filtered[c].length === 0) && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                No matches. Press Enter in the Additional Expertise field below to add it as a custom tag.
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function highlight(label: string, q: string) {
  const idx = label.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground">{label.slice(idx, idx + q.length)}</mark>
      {label.slice(idx + q.length)}
    </>
  );
}
