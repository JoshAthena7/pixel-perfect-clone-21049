import { useState, type FormEvent } from "react";
import type { z } from "zod";
import { toast } from "sonner";
import {
  validate,
  mapSupabaseError,
  summarizeServerErrors,
  type FieldErrors,
  type SupabaseLikeError,
} from "./action-schemas";

/**
 * useSchemaForm — unified Zod-validated form state + Supabase error mapping.
 *
 * Collapses the per-form boilerplate (values, touched tracking, server
 * errors, submit gating, toast on failure, reset on success) into a single
 * hook so every Mission Control modal has identical UX guarantees.
 */
export function useSchemaForm<TValues extends Record<string, unknown>>(opts: {
  schema: z.ZodTypeAny;
  initialValues: TValues;
  /** DB column → form-field key, used to attribute Postgres errors. */
  columnMap?: Partial<Record<string, keyof TValues>>;
  /** Title shown in the toast when the server rejects the submission. */
  errorToast: string;
  /** Label shown in the launcher's "just saved" pill on success. */
  successLabel: string;
  /** Build & execute the Supabase write. Must return PostgrestError-shaped result. */
  onSubmit: (data: TValues) => Promise<{ error: SupabaseLikeError | null }>;
  /** Called with `successLabel` after a successful write. */
  onSuccess: (label: string) => void;
  /** Optional partial reset applied to `values` after success. */
  resetTo?: Partial<TValues>;
}) {
  const [values, setValues] = useState<TValues>(opts.initialValues);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof TValues, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<
    Partial<Record<keyof TValues, string>>
  >({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const { success, errors, data } = validate(opts.schema, values);
  const clientErrors = errors as FieldErrors<TValues>;

  const setField = <K extends keyof TValues>(k: K, v: TValues[K]) => {
    setValues((p) => ({ ...p, [k]: v }));
    if (serverFieldErrors[k]) {
      setServerFieldErrors((p) => {
        const next = { ...p };
        delete next[k];
        return next;
      });
    }
  };

  const mark = (k: keyof TValues) => setTouched((p) => ({ ...p, [k]: true }));
  const showErr = (k: keyof TValues) => attempted || !!touched[k];

  const err = (k: keyof TValues): string | undefined =>
    (showErr(k) ? clientErrors[k] : undefined) ?? serverFieldErrors[k];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!success || !data) return;
    setSaving(true);
    setServerFieldErrors({});
    setFormError(undefined);
    const { error } = await opts.onSubmit(data as TValues);
    setSaving(false);
    if (error) {
      const mapped = mapSupabaseError<TValues>(error, opts.columnMap ?? {});
      setServerFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
      toast.error(opts.errorToast, {
        description:
          summarizeServerErrors(mapped) ?? error.message ?? undefined,
      });
      return;
    }
    if (opts.resetTo) setValues((p) => ({ ...p, ...opts.resetTo! }));
    opts.onSuccess(opts.successLabel);
  }

  return {
    values,
    setField,
    mark,
    err,
    formError,
    valid: success,
    saving,
    handleSubmit,
  };
}
