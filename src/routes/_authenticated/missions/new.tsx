import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/missions/new")({
  component: NewMissionPage,
});

function NewMissionPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", client: "", state: "", submission_date: "", description: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("missions").insert({
        name: form.name,
        client: form.client,
        state: form.state || null,
        submission_date: form.submission_date || null,
        description: form.description || null,
        created_by: user!.id,
      }).select("id").single();
      if (error) throw error;
      toast.success("Mission created");
      navigate({ to: "/missions/$missionId", params: { missionId: data.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Could not create mission");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h1 className="mb-6 text-xl font-semibold">New Mission</h1>
      <form onSubmit={submit} className="space-y-4 rounded-[10px] border border-border bg-surface p-6">
        <div className="space-y-1.5"><Label>Mission name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Client</Label><Input required value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="e.g. TX" /></div>
          <div className="space-y-1.5"><Label>Submission date</Label><Input type="date" value={form.submission_date} onChange={(e) => setForm({ ...form, submission_date: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create mission"}</Button>
      </form>
    </div>
  );
}
