import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StatusSchema = z.enum(["draft", "submitted", "answered", "withdrawn"]);

export type ClarificationStatus = z.infer<typeof StatusSchema>;

export type Clarification = {
  id: string;
  mission_id: string;
  number: number;
  question: string;
  status: ClarificationStatus;
  submitted_at: string | null;
  answered_at: string | null;
  client_response: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const MissionIdInput = z.object({ missionId: z.string().uuid() });

export const listClarifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("client_clarifications")
      .select("*")
      .eq("mission_id", data.missionId)
      .order("number", { ascending: true });
    if (error) throw new Error(error.message);
    return { clarifications: (rows ?? []) as Clarification[] };
  });

const CreateInput = z.object({
  missionId: z.string().uuid(),
  question: z.string().min(3).max(2000),
});

export const createClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("client_clarifications")
      .insert({
        mission_id: data.missionId,
        number: 0, // trigger assigns the next number
        question: data.question.trim(),
        status: "draft",
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { clarification: row as Clarification };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  question: z.string().min(3).max(2000).optional(),
  status: StatusSchema.optional(),
  client_response: z.string().max(8000).nullable().optional(),
});

export const updateClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.question !== undefined) patch.question = data.question.trim();
    if (data.client_response !== undefined) patch.client_response = data.client_response;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "submitted") patch.submitted_at = new Date().toISOString();
      if (data.status === "answered") patch.answered_at = new Date().toISOString();
    }
    const { data: row, error } = await supabase
      .from("client_clarifications")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { clarification: row as Clarification };
  });

const DeleteInput = z.object({ id: z.string().uuid() });

export const deleteClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("client_clarifications")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
