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
  requestType: z.enum(["sos", "support"]).default("sos"),
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

export const flagIssueSchema = z.object({
  severity: z.enum(["Yellow", "Orange", "Red"]),
  type: z.enum(["sos", "risk"]),
  description: requiredText(1, 2000, "Tell us what's wrong"),
  action: longText(2000),
});
export type FlagIssueValues = z.infer<typeof flagIssueSchema>;

export const tlcSchema = z.object({
  note: requiredText(1, 2000, "Add a note"),
  followUp: requiredText(1, 120),
});
export type TlcValues = z.infer<typeof tlcSchema>;

export const starSchema = z.object({
  note: requiredText(1, 2000, "Add a note"),
  followUp: requiredText(1, 120),
});
export type StarValues = z.infer<typeof starSchema>;

export const threadSchema = z.object({
  sectionId: requiredText(1, 120, "Pick a section"),
  message: requiredText(1, 4000, "Write a message"),
});
export type ThreadValues = z.infer<typeof threadSchema>;

export const quickChatSchema = z.object({
  peerId: requiredText(1, 120, "Pick a teammate"),
  message: requiredText(1, 4000, "Write a message"),
});
export type QuickChatValues = z.infer<typeof quickChatSchema>;

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

// ---------------------------------------------------------------------------
// Server-side (Supabase / Postgres) error mapping
//
// Goal: take a PostgrestError-shaped object and produce the same
// { fieldErrors, formError } shape we use for client validation, so each
// modal renders server failures with the same inline UI as zod errors.
// ---------------------------------------------------------------------------

export type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type ServerErrors<T> = {
  fieldErrors: Partial<Record<keyof T, string>>;
  formError?: string;
};

/**
 * Extract the offending column name from a Postgres error, looking at
 * `message` first and then `details` (where unique-violation key info lives).
 */
function extractColumn(error: SupabaseLikeError): string | undefined {
  const sources = [error.message ?? "", error.details ?? ""];
  for (const s of sources) {
    const m =
      s.match(/column "([^"]+)"/i) ??
      s.match(/Key \(([^)]+)\)=/i) ??
      s.match(/violates not-null constraint .* column "([^"]+)"/i);
    if (m?.[1]) {
      // Key (col1, col2) -> take first column
      return m[1].split(",")[0].trim();
    }
  }
  return undefined;
}

/**
 * Map a PostgrestError-like object to schema-aligned field errors.
 *
 * `columnToField` maps DB column names to form-field keys. Pass it when the
 * form value names differ from the underlying column (e.g. `blocker` ->
 * `description`).
 */
export function mapSupabaseError<TValues extends Record<string, unknown>>(
  error: SupabaseLikeError | null | undefined,
  columnToField: Partial<Record<string, keyof TValues>> = {},
): ServerErrors<TValues> {
  if (!error) return { fieldErrors: {}, formError: undefined };

  const code = (error.code ?? "").toString();
  const rawMessage = (error.message ?? "Something went wrong saving this.").trim();
  const column = extractColumn(error);
  const field = column ? columnToField[column] : undefined;

  const put = (msg: string): ServerErrors<TValues> =>
    field
      ? { fieldErrors: { [field]: msg } as Partial<Record<keyof TValues, string>> }
      : { fieldErrors: {}, formError: column ? `${msg} (${column})` : msg };

  switch (code) {
    case "23502": // not_null_violation
      return put("This field is required.");
    case "23505": // unique_violation
      return put("This value is already taken.");
    case "23514": // check_violation
      return put("This value doesn't meet the validation rules.");
    case "22001": // string_data_right_truncation
      return put("This value is too long.");
    case "22007": // invalid_datetime_format
    case "22008":
      return put("Use a valid date.");
    case "23503": // foreign_key_violation
      return {
        fieldErrors: {},
        formError: "A referenced record no longer exists. Reload and try again.",
      };
    case "42501": // insufficient_privilege
    case "PGRST301":
    case "PGRST302":
      return {
        fieldErrors: {},
        formError: "You don't have permission to perform this action.",
      };
    case "PGRST204": // unknown column
      return {
        fieldErrors: {},
        formError: "The form is out of sync with the server. Refresh and retry.",
      };
    case "23P01": // exclusion_violation
      return put("This conflicts with another record.");
    default:
      // Fall back: surface the raw message but keep it short.
      return {
        fieldErrors: {},
        formError: rawMessage.length > 220 ? `${rawMessage.slice(0, 220)}…` : rawMessage,
      };
  }
}

/** Convenience: best single-line summary for a toast description. */
export function summarizeServerErrors<T>(result: ServerErrors<T>): string | undefined {
  if (result.formError) return result.formError;
  const first = Object.values(result.fieldErrors).find(Boolean) as string | undefined;
  return first;
}

