import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type TabKey = "all" | "pending" | "active" | "no_activity" | "capacity";

export type Filters = {
  search: string;
  roles: Set<string>;
  atlasStatus: string; // "all" or specific
  tdStatus: string;    // "all" or specific
  skills: Set<string>;
};

export const EMPTY_FILTERS: Filters = {
  search: "",
  roles: new Set(),
  atlasStatus: "all",
  tdStatus: "all",
  skills: new Set(),
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "engagement_lead", label: "Engagement Lead" },
  { value: "writer", label: "Writer" },
  { value: "sme", label: "SME" },
  { value: "reviewer", label: "Reviewer" },
  { value: "unassigned", label: "Unassigned" },
];

const ATLAS_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "not_invited", label: "Not Invited" },
  { value: "invite_sent", label: "Invite Sent" },
  { value: "active", label: "Active" },
  { value: "never_logged_in", label: "Never Logged In" },
  { value: "onboarding_incomplete", label: "Onboarding Incomplete" },
];

const TD_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "pending_onboarding", label: "Pending Onboarding" },
];

export function filtersAreActive(f: Filters): boolean {
  return (
    f.search.trim().length > 0 ||
    f.roles.size > 0 ||
    f.atlasStatus !== "all" ||
    f.tdStatus !== "all" ||
    f.skills.size > 0
  );
}

export function AthenaTeamTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: TabKey;
  counts: Record<TabKey, number>;
  onChange: (t: TabKey) => void;
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All Members" },
    { key: "pending", label: "Pending Invites" },
    { key: "active", label: "Active" },
    { key: "no_activity", label: "No Activity" },
    { key: "capacity", label: "Capacity" },
  ];
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const isActive = activeTab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative whitespace-nowrap px-3 py-2 text-sm transition-colors ${
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{t.label}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">({counts[t.key]})</span>
            {isActive && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[color:var(--athena-gold,#d4af37)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export type SkillOption = { value: string; label: string; count: number };

export function AthenaTeamFilterBar({
  filters,
  setFilters,
  skillOptions,
  onClearAll,
  filteredCount,
  totalCount,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  skillOptions: SkillOption[];
  onClearAll: () => void;
  filteredCount: number;
  totalCount: number;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);

  // Debounce search 300ms
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const active = filtersAreActive(filters);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email, or skill..."
            className="h-9 pl-8 text-sm"
          />
        </div>

        <MultiSelectFilter
          label="Role"
          options={ROLE_OPTIONS}
          selected={filters.roles}
          onChange={(next) => setFilters({ ...filters, roles: next })}
        />

        <SingleSelectFilter
          label="ATLAS Status"
          options={ATLAS_STATUS_OPTIONS}
          value={filters.atlasStatus}
          onChange={(v) => setFilters({ ...filters, atlasStatus: v })}
        />

        <SingleSelectFilter
          label="TD Status"
          options={TD_STATUS_OPTIONS}
          value={filters.tdStatus}
          onChange={(v) => setFilters({ ...filters, tdStatus: v })}
        />

        <MultiSelectFilter
          label="Skills"
          options={skillOptions.map((s) => ({ value: s.value, label: `${s.label} (${s.count})` }))}
          selected={filters.skills}
          onChange={(next) => setFilters({ ...filters, skills: next })}
          searchable
          emptyText={
            skillOptions.length === 0
              ? "No skills on file. Skills are imported from TalentDesk."
              : "No matches"
          }
        />

        {active && (
          <button
            onClick={onClearAll}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[color:var(--athena-gold,#d4af37)] hover:underline"
          >
            <X className="h-3 w-3" /> Clear all filters
          </button>
        )}
      </div>

      {active && (
        <div className="text-xs text-muted-foreground">
          Showing {filteredCount} of {totalCount} members
        </div>
      )}
    </div>
  );
}

function SingleSelectFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const isActive = value !== "all";
  const display = options.find((o) => o.value === value)?.label ?? "All";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors ${
            isActive
              ? "border-[color:var(--athena-gold,#d4af37)]/60 bg-surface"
              : "border-border bg-surface hover:bg-surface-hover"
          }`}
        >
          <span className="text-muted-foreground">{label}:</span>
          <span>{display}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
          {isActive && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[color:var(--athena-gold,#d4af37)]" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover ${
              o.value === value ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {o.label}
            {o.value === value && <Check className="h-3.5 w-3.5" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  emptyText = "No options",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  searchable?: boolean;
  emptyText?: string;
}) {
  const isActive = selected.size > 0;
  const display =
    selected.size === 0
      ? "All"
      : selected.size === 1
        ? options.find((o) => selected.has(o.value))?.label ?? `${selected.size}`
        : `${selected.size} selected`;
  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors ${
            isActive
              ? "border-[color:var(--athena-gold,#d4af37)]/60 bg-surface"
              : "border-border bg-surface hover:bg-surface-hover"
          }`}
        >
          <span className="text-muted-foreground">{label}:</span>
          <span>{display}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
          {isActive && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[color:var(--athena-gold,#d4af37)]" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = selected.has(o.value);
                return (
                  <CommandItem key={o.value} onSelect={() => toggle(o.value)} className="flex items-center gap-2">
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        checked
                          ? "border-[color:var(--athena-gold,#d4af37)] bg-[color:var(--athena-gold,#d4af37)]/20"
                          : "border-border"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
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
