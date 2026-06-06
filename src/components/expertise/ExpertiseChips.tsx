import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, Star } from "lucide-react";
import type { ExpertiseCategory } from "@/lib/expertise.functions";
import { CATEGORY_META, CUSTOM_COLOR } from "./category-meta";

export type DisplayChip = {
  /** stable key — expertise_id for structured, "custom:<lowercase label>" for custom */
  key: string;
  label: string;
  category: ExpertiseCategory | null; // null = custom
  isPrimary: boolean;
};

type Props = {
  chips: DisplayChip[];
  onReorder: (newOrder: DisplayChip[]) => void;
  onRemove: (key: string) => void;
  onTogglePrimary: (key: string) => void;
};

export function ExpertiseChips({ chips, onReorder, onRemove, onTogglePrimary }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const primaryCount = chips.filter((c) => c.isPrimary).length;

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = chips.findIndex((c) => c.key === active.id);
    const newIdx = chips.findIndex((c) => c.key === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onReorder(arrayMove(chips, oldIdx, newIdx));
  }

  // Sort: primary first preserving relative order, then secondary
  const sorted = [...chips].sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1));
  const primaries = sorted.filter((c) => c.isPrimary);
  const secondaries = sorted.filter((c) => !c.isPrimary);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sorted.map((c) => c.key)} strategy={horizontalListSortingStrategy}>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          {chips.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              Use the search above to add your expertise areas.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {primaries.map((chip) => (
                  <ChipItem
                    key={chip.key}
                    chip={chip}
                    primaryDisabled={false}
                    onRemove={onRemove}
                    onTogglePrimary={onTogglePrimary}
                  />
                ))}
              </div>

              {primaries.length > 0 && secondaries.length > 0 && (
                <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  <span>Primary · Secondary</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {secondaries.map((chip) => (
                  <ChipItem
                    key={chip.key}
                    chip={chip}
                    primaryDisabled={primaryCount >= 5}
                    onRemove={onRemove}
                    onTogglePrimary={onTogglePrimary}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function ChipItem({
  chip,
  primaryDisabled,
  onRemove,
  onTogglePrimary,
}: {
  chip: DisplayChip;
  primaryDisabled: boolean;
  onRemove: (key: string) => void;
  onTogglePrimary: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chip.key,
  });
  const [showHint, setShowHint] = useState(false);

  const color = chip.category ? CATEGORY_META[chip.category].color : CUSTOM_COLOR;
  const isCustom = !chip.category;

  const baseStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const chipStyle: React.CSSProperties = chip.isPrimary
    ? { ...baseStyle, backgroundColor: color, borderColor: color }
    : { ...baseStyle, borderColor: color };

  function handleDotClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!chip.isPrimary && primaryDisabled) {
      setShowHint(true);
      window.setTimeout(() => setShowHint(false), 2200);
      return;
    }
    onTogglePrimary(chip.key);
  }

  return (
    <span
      ref={setNodeRef}
      style={chipStyle}
      {...attributes}
      {...listeners}
      className={`group relative inline-flex cursor-grab items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-shadow ${
        chip.isPrimary
          ? "text-white shadow-sm"
          : isCustom
            ? "border border-dashed text-foreground"
            : "border bg-background text-foreground"
      } ${isDragging ? "z-10 shadow-lg" : ""}`}
      title={chip.isPrimary ? "Primary expertise" : "Click the dot to mark as primary"}
    >

      <button
        type="button"
        onClick={handleDotClick}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-3 w-3 items-center justify-center rounded-full"
        style={{ backgroundColor: chip.isPrimary ? "rgba(255,255,255,0.35)" : color }}
        aria-label={chip.isPrimary ? "Remove primary" : "Mark as primary"}
      >
        {chip.isPrimary && <Star className="h-2 w-2 fill-white text-white" />}
      </button>
      <span className="pointer-events-none select-none">{chip.label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(chip.key);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`-mr-1 ml-0.5 rounded-full p-0.5 transition-opacity ${
          chip.isPrimary ? "opacity-80 hover:bg-white/20" : "opacity-50 hover:opacity-100 hover:bg-muted"
        }`}
        aria-label="Remove"
      >
        <X className="h-3 w-3" />
      </button>
      {showHint && (
        <span className="absolute -top-8 left-0 z-20 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background shadow">
          5 primary max — remove one first
        </span>
      )}
    </span>
  );
}
