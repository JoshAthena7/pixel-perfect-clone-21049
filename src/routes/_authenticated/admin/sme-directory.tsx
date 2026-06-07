// PF-1: Admin page — manage Athena Strategy Group's internal SME directory.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, X, Check } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Sme = {
  id: string;
  user_id: string | null;
  display_name: string;
  title: string | null;
  organization: string | null;
  email: string;
  phone: string | null;
  expertise_areas: string[] | null;
  bio: string | null;
  availability: "available" | "limited" | "unavailable";
  is_active: boolean;
};

export const Route = createFileRoute("/_authenticated/admin/sme-directory")({
  component: SmeDirectoryPage,
});

const smeSchema = z.object({
  display_name: z.string().trim().min(1, "Name is required").max(120),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  organization: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  expertise_areas_csv: z.string().trim().max(1000).optional().or(z.literal("")),
  bio: z.string().trim().max(4000).optional().or(z.literal("")),
  availability: z.enum(["available", "limited", "unavailable"]),
});

function SmeDirectoryPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Sme | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: smes = [], isLoading } = useQuery<Sme[]>({
    queryKey: ["admin-athena-smes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athena_smes")
        .select("*")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Sme[];
    },
  });

  async function toggleActive(sme: Sme) {
    const { error } = await supabase
      .from("athena_smes")
      .update({ is_active: !sme.is_active })
      .eq("id", sme.id);
    if (error) toast.error(error.message);
    else {
      toast.success(sme.is_active ? "SME deactivated" : "SME activated");
      qc.invalidateQueries({ queryKey: ["admin-athena-smes"] });
    }
  }

  return (
    <div className="p-6 max-w-[1100px]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">SME Directory</h1>
          <p className="text-[12px] text-muted-foreground">
            Manage Athena Strategy Group internal subject-matter experts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
        >
          <Plus className="h-3.5 w-3.5" /> Add SME
        </button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-xs text-muted-foreground">One moment…</div>
      ) : (
        <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground bg-surface/60">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Expertise</th>
                <th className="px-3 py-2">Availability</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {smes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-xs text-muted-foreground">
                    No SMEs yet. Click "Add SME" to register your first expert.
                  </td>
                </tr>
              )}
              {smes.map((s) => (
                <tr key={s.id} className="border-t border-border/60 hover:bg-surface-hover/40">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.display_name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.email}</div>
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground">{s.title ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(s.expertise_areas ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded-full px-2 py-0.5 text-[10px]"
                          style={{
                            background: "rgba(201,168,76,0.10)",
                            color: "#C9A84C",
                            border: "1px solid rgba(201,168,76,0.25)",
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background:
                            s.availability === "available"
                              ? "#22C55E"
                              : s.availability === "limited"
                                ? "#F59E0B"
                                : "#EF4444",
                        }}
                      />
                      {s.availability}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleActive(s)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${s.is_active ? "bg-emerald-500/70" : "bg-muted"}`}
                      aria-label="Toggle active"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s.is_active ? "translate-x-4" : "translate-x-0.5"}`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SmeForm
        open={creating || !!editing}
        sme={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-athena-smes"] })}
      />
    </div>
  );
}

function SmeForm({
  open,
  sme,
  onClose,
  onSaved,
}: {
  open: boolean;
  sme: Sme | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isEdit = !!sme;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = smeSchema.safeParse({
      display_name: fd.get("display_name"),
      title: fd.get("title") ?? "",
      organization: fd.get("organization") ?? "",
      email: fd.get("email"),
      phone: fd.get("phone") ?? "",
      expertise_areas_csv: fd.get("expertise_areas_csv") ?? "",
      bio: fd.get("bio") ?? "",
      availability: fd.get("availability"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    const v = parsed.data;
    const expertise_areas = (v.expertise_areas_csv ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setBusy(true);
    try {
      const payload = {
        display_name: v.display_name,
        title: v.title || null,
        organization: v.organization || "Athena Strategy Group",
        email: v.email,
        phone: v.phone || null,
        expertise_areas,
        bio: v.bio || null,
        availability: v.availability,
      };
      const op = isEdit
        ? supabase.from("athena_smes").update(payload).eq("id", sme!.id)
        : supabase.from("athena_smes").insert(payload);
      const { error } = await op;
      if (error) throw error;
      toast.success(isEdit ? "SME updated" : "SME added");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-sm font-semibold">{isEdit ? "Edit SME" : "Add SME"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-3">
          <Field label="Display name *">
            <input name="display_name" required maxLength={120} defaultValue={sme?.display_name ?? ""} className={inputCls} />
          </Field>
          <Field label="Title">
            <input name="title" maxLength={200} defaultValue={sme?.title ?? ""} className={inputCls} />
          </Field>
          <Field label="Organization">
            <input name="organization" maxLength={200} defaultValue={sme?.organization ?? "Athena Strategy Group"} className={inputCls} />
          </Field>
          <Field label="Email *">
            <input name="email" type="email" required maxLength={255} defaultValue={sme?.email ?? ""} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input name="phone" maxLength={50} defaultValue={sme?.phone ?? ""} className={inputCls} />
          </Field>
          <Field label="Expertise areas (comma-separated)">
            <input
              name="expertise_areas_csv"
              maxLength={1000}
              defaultValue={(sme?.expertise_areas ?? []).join(", ")}
              placeholder="Behavioral Health, Child Welfare, Federal Procurement"
              className={inputCls}
            />
          </Field>
          <Field label="Bio">
            <textarea name="bio" rows={4} maxLength={4000} defaultValue={sme?.bio ?? ""} className={inputCls} />
          </Field>
          <Field label="Availability">
            <select name="availability" defaultValue={sme?.availability ?? "available"} className={inputCls}>
              <option value="available">Available</option>
              <option value="limited">Limited</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <X className="inline h-3 w-3 mr-1" /> Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> {busy ? "Saving…" : isEdit ? "Save changes" : "Add SME"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--athena-gold,#C9A84C)]/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
