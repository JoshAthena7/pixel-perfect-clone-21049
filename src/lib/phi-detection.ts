// C2: Server-side PHI detection. Fail-closed by design.
//
// Build a single shared utility used by EVERY ingestion path: Score Me drafts,
// Vault uploads, IRIS knowledge ingest, RFP parser, document extraction.
// Never log matched values — only matched pattern *types*.
//
// Patterns are tuned for HIPAA Safe Harbor identifiers. False positives are
// acceptable; missed real PHI is not. The bar: protect real PHI at the cost
// of occasionally flagging something innocent.

export type PHIPattern =
  | "SSN"
  | "DOB"
  | "MRN"
  | "MemberID"
  | "StreetAddress"
  | "ZipInClinicalContext"
  | "ClinicalProperNoun"
  | "ExplicitPHILanguage";

export interface PHIDetectionResult {
  containsPHI: boolean;
  patternsFound: PHIPattern[];
  confidence: "high" | "medium";
}

// --- HIGH CONFIDENCE — exact-pattern regex ---

const RE_SSN = /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/;

const RE_DOB =
  /(date of birth|dob|born on|birth date)[:\s]+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i;

const RE_MRN =
  /(mrn|medical record|record #|patient id)[:\s#]+[A-Z0-9]{6,12}/i;

const RE_MEMBER =
  /(member id|subscriber id|policy #|beneficiary)[:\s]+[A-Z0-9\-]{6,20}/i;

// Street + ZIP only count as PHI when they appear NEAR a clinical term
// (within ~120 chars). Without proximity, a healthcare RFP that mentions
// "patient outcomes" on page 3 and a vendor mailing address on page 90
// would always trip — useless signal, blocks legitimate intake.
const RE_STREET_NEAR_CLINICAL =
  /(\b\d+\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Blvd|Court|Ct)\b[\s\S]{0,120}\b(?:patient|diagnosis|treatment|prescription|medical record|health condition)\b)|(\b(?:patient|diagnosis|treatment|prescription|medical record|health condition)\b[\s\S]{0,120}\b\d+\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Blvd|Court|Ct)\b)/;

const RE_ZIP_NEAR_CLINICAL =
  /(\b\d{5}(?:-\d{4})?\b[\s\S]{0,120}\b(?:patient|diagnosis|treatment|prescription|medical record|health condition)\b)|(\b(?:patient|diagnosis|treatment|prescription|medical record|health condition)\b[\s\S]{0,120}\b\d{5}(?:-\d{4})?\b)/;

// --- MEDIUM CONFIDENCE — contextual ---

// "patient name", "patient dob", etc.
const RE_EXPLICIT_PHI =
  /\b(patient name|patient dob|patient address|patient record)\b/i;

// Proper name within 50 chars of a clinical term (either direction).
// Require an explicit personal-name title (Mr./Mrs./Ms./Dr./Mx.) followed by
// a capitalized name, within 80 chars of a clinical term. Without the title
// prefix, "Care Coordination" near "patient" — extremely common in healthcare
// RFP/strategy content — would false-positive. PHI in real proposals almost
// always appears as "Mr. Smith / Dr. Jones" patterns, not bare proper nouns.
const RE_CLINICAL_PROPER_NOUN =
  /(\b(?:patient|diagnosis|treatment|prescription|clinical|medical record|health condition)\b[\s\S]{0,80}\b(?:Mr|Mrs|Ms|Mx|Dr)\.\s+[A-Z][a-z]+)|(\b(?:Mr|Mrs|Ms|Mx|Dr)\.\s+[A-Z][a-z]+[\s\S]{0,80}\b(?:patient|diagnosis|treatment|prescription|clinical|medical record|health condition)\b)/;

// Strip HTML tags and simple markdown syntax so the regex runs on plain text.
function toPlainText(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_`~#>]/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ");
}

/**
 * Detect PHI in arbitrary text. Pure function, no I/O. <200ms on 40k chars.
 * NEVER returns matched values — only the pattern types that fired.
 */
export function detectPHI(text: string): PHIDetectionResult {
  if (!text || typeof text !== "string") {
    return { containsPHI: false, patternsFound: [], confidence: "high" };
  }
  const plain = toPlainText(text);

  const found = new Set<PHIPattern>();
  let highConfidence = false;

  if (RE_SSN.test(plain)) {
    found.add("SSN");
    highConfidence = true;
  }
  if (RE_DOB.test(plain)) {
    found.add("DOB");
    highConfidence = true;
  }
  if (RE_MRN.test(plain)) {
    found.add("MRN");
    highConfidence = true;
  }
  if (RE_MEMBER.test(plain)) {
    found.add("MemberID");
    highConfidence = true;
  }
  if (RE_STREET_NEAR_CLINICAL.test(plain)) {
    found.add("StreetAddress");
    highConfidence = true;
  }

  // Zip codes only count when adjacent to a clinical term — not co-present
  // anywhere in a long document.
  if (RE_ZIP_NEAR_CLINICAL.test(plain)) {
    found.add("ZipInClinicalContext");
  }


  // Medium-confidence contextual signals
  if (RE_EXPLICIT_PHI.test(plain)) {
    found.add("ExplicitPHILanguage");
  }
  if (RE_CLINICAL_PROPER_NOUN.test(plain)) {
    found.add("ClinicalProperNoun");
  }

  return {
    containsPHI: found.size > 0,
    patternsFound: [...found],
    confidence: highConfidence ? "high" : "medium",
  };
}

// ---------- Error envelope ----------
//
// TanStack server functions surface only `error.message` to the client. We
// embed a structured payload as JSON behind a stable prefix so the UI can
// detect PHI rejection deterministically and render the non-dismissible
// warning instead of a generic toast.

export const PHI_ERROR_PREFIX = "PHI_DETECTED::";

export interface PHIErrorPayload {
  error: "phi_detected";
  message: string;
  patterns: PHIPattern[];
  support: string;
}

export function buildPHIErrorPayload(patterns: PHIPattern[]): PHIErrorPayload {
  return {
    error: "phi_detected",
    message:
      "IRIS detected content that may include protected health information (PHI). For HIPAA compliance, PHI cannot be processed through Atlas. Please remove any patient names, dates of birth, Social Security Numbers, medical record numbers, or other personal health identifiers from your draft before resubmitting.",
    patterns,
    support:
      "If you believe this is a false positive, contact your engagement lead before proceeding.",
  };
}

/** Parse a server-fn Error message and return the PHI payload if present. */
export function parsePHIError(message: string | undefined | null): PHIErrorPayload | null {
  if (!message) return null;
  const idx = message.indexOf(PHI_ERROR_PREFIX);
  if (idx === -1) return null;
  try {
    const json = message.slice(idx + PHI_ERROR_PREFIX.length);
    const parsed = JSON.parse(json);
    if (parsed?.error === "phi_detected") return parsed as PHIErrorPayload;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Run detection and, on hit, log the rejection (metadata only) and throw a
 * structured Error. FAIL-CLOSED: if detection or logging itself throws, the
 * caller still aborts — never let bad input through because the scanner
 * crashed.
 */
export async function assertNoPHI(args: {
  text: string;
  surface: "score_me" | "vault_upload" | "iris_ingest" | "rfp_parser" | "document_extraction";
  actorUserId?: string | null;
  engagementId?: string | null;
}): Promise<void> {
  let result: PHIDetectionResult;
  try {
    result = detectPHI(args.text);
  } catch (e) {
    // Fail-closed: scanner error blocks the submission.
    const payload = buildPHIErrorPayload([]);
    payload.message =
      "PHI safety check could not run. Submission was blocked to protect any protected health information. Please try again; if this persists, contact your engagement lead.";
    throw new Error(`${PHI_ERROR_PREFIX}${JSON.stringify(payload)}`);
  }
  if (!result.containsPHI) return;

  // Best-effort audit log. Never lets a logging failure pass the submission.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("phi_rejection_log").insert({
      actor_user_id: args.actorUserId ?? null,
      engagement_id: args.engagementId ?? null,
      surface: args.surface,
      patterns_matched: result.patternsFound,
      confidence: result.confidence,
    } as never);
  } catch {
    // Logging failure must NOT cause fail-open — we still throw below.
  }

  const payload = buildPHIErrorPayload(result.patternsFound);
  throw new Error(`${PHI_ERROR_PREFIX}${JSON.stringify(payload)}`);
}
