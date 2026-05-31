import { z } from "zod";

// Shared primitives ---------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Use a valid date");

const shortText = (max: number, label = "Keep it short") =>
  z.string().trim().max(max, `${label} (max ${max} characters)`);

const longText = (max: number) =>
  z.string().max(max, `Keep under ${max} characters`);

const requiredText = (min = 1, max = 2000, msg = "Required") =>
  z
    .string()
    .trim()
    .min(min, msg)
    .max(max, `Keep under ${max} characters`);

// Modal schemas -------------------------------------------------------------

export const sosSchema = z.object({
  blocker: requiredText(1, 2000, "Describe the blocker"),
  impact: longText(2000),
  who: shortText(120),
  by: shortText(120),
});
export type SosValues = z.infer<typeof sosSchema>;

export const huddleSchema = z.object({
  date: isoDate,
  focus: requiredText(1, 2000, "Add focus areas"),
  attendees: z.array(z.string()).max(50, "Too many attendees"),
  flag: longText(2000),
});
export type HuddleValues = z.infer<typeof huddleSchema>;

export const broadcastSchema = z.object({
  subject: shortText(140),
  message: requiredText(1, 4000, "Write a message"),
  tone: z.enum(["Informational", "Urgent", "Encouraging", "Reminder"]),
  audience: z.enum(["Full team", "SMEs only", "Writers only", "Leads only"]),
});
export type BroadcastValues = z.infer<typeof broadcastSchema>;

export const pulseSchema = z.object({
  period: shortText(140),
  pullRoster: z.boolean(),
  completed: requiredText(1, 4000, "Fill in sections completed"),
  inProgress: longText(4000),
  issues: longText(4000),
});
export type PulseValues = z.infer<typeof pulseSchema>;

export const decisionSchema = z.object({
  decision: requiredText(1, 2000, "Describe the decision"),
  madeBy: requiredText(1, 120, "Pick who made the call"),
  rationale: longText(2000),
  date: isoDate,
});
export type DecisionValues = z.infer<typeof decisionSchema>;

export const riskSchema = z.object({
  description: requiredText(1, 2000, "Describe the risk"),
  section: shortText(140),
  likelihood: z.enum(["Low", "Medium", "High"]),
  impact: z.enum(["Low", "Medium", "High", "Critical"]),
  mitigation: longText(2000),
  owner: shortText(120),
});
export type RiskValues = z.infer<typeof riskSchema>;

export const heatmapSchema = z.object({
  writer: shortText(120),
  issue: z.enum(["Completeness", "Compliance risk", "Win theme strength", "Behind schedule"]),
  section: requiredText(1, 140, "Add a section"),
  notes: longText(2000),
});
export type HeatmapValues = z.infer<typeof heatmapSchema>;

// Helper: shape that the form UI consumes ----------------------------------

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function validate<T extends z.ZodTypeAny>(
  schema: T,
  values: unknown,
): { success: boolean; errors: FieldErrors<z.infer<T>>; data?: z.infer<T> } {
  const result = schema.safeParse(values);
  if (result.success) return { success: true, errors: {}, data: result.data };
  const flat = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const errors: Record<string, string> = {};
  for (const key in flat) {
    const msg = flat[key]?.[0];
    if (msg) errors[key] = msg;
  }
  return { success: false, errors: errors as FieldErrors<z.infer<T>> };
}
