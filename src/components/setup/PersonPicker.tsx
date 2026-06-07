import { useState } from "react";
import { Check, ChevronDown, UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

export type PersonOption = {
  id: string;
  display_name?: string | null;
  email?: string | null;
};

/**
 * Searchable inline person picker. Renders as a small "+ Add person…"
 * trigger; opens a Popover with a Command search field over the platform
 * roster. Calls onSelect(option) when a row is picked.
 */
export function PersonPicker({
  options,
  selectedId,
  onSelect,
  placeholder = "+ Add person…",
  emptyText = "No people found.",
  disabled = false,
  width = 280,
}: {
  options: PersonOption[];
  selectedId?: string | null;
  onSelect: (option: PersonOption) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === selectedId);
  const label = current
    ? current.display_name || current.email || current.id.slice(0, 6)
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover disabled:opacity-50"
        >
          {!current && <UserPlus className="h-3 w-3 opacity-60" />}
          <span className={current ? "" : "text-muted-foreground"}>{label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width }}
        onOpenAutoFocus={(e) => {
          // let Command focus the search input
          e.preventDefault();
        }}
      >
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const name = opt.display_name || opt.email || opt.id.slice(0, 6);
                return (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.display_name ?? ""} ${opt.email ?? ""} ${opt.id}`}
                    onSelect={() => {
                      onSelect(opt);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">{name}</div>
                      {opt.email && opt.display_name && (
                        <div className="truncate text-[10px] text-muted-foreground">{opt.email}</div>
                      )}
                    </div>
                    {selectedId === opt.id && <Check className="h-3.5 w-3.5 opacity-70" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
