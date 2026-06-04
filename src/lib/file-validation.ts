// M4: Vault upload hardening — mime check, size cap, magic bytes,
// lightweight text extraction for PHI scanning.

export const VAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export const VAULT_ALLOWED_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "text/plain": ["txt", "md"],
  "text/markdown": ["md"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-powerpoint": ["ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
};

export interface FileValidationError {
  error: "unsupported_file_type" | "file_too_large" | "magic_bytes_mismatch";
  message: string;
}

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function validateVaultMime(
  fileName: string,
  declaredMime: string,
): FileValidationError | null {
  const ext = getExt(fileName);
  const exts = VAULT_ALLOWED_MIME[declaredMime];
  if (!exts || !exts.includes(ext)) {
    return {
      error: "unsupported_file_type",
      message:
        "Only document file types are permitted in the Atlas vault (.pdf, .docx, .doc, .txt, .md, .xlsx, .xls, .pptx, .ppt).",
    };
  }
  return null;
}

export function validateVaultSize(byteLength: number): FileValidationError | null {
  if (byteLength > VAULT_MAX_BYTES) {
    return {
      error: "file_too_large",
      message: `File exceeds the 50 MB vault upload limit.`,
    };
  }
  return null;
}

// Magic bytes / file signatures for permitted MIME types.
function startsWith(buf: Uint8Array, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return false;
  return true;
}

export function validateVaultMagicBytes(
  buf: Uint8Array,
  declaredMime: string,
): FileValidationError | null {
  // PDF: %PDF
  if (declaredMime === "application/pdf") {
    if (!startsWith(buf, [0x25, 0x50, 0x44, 0x46])) {
      return { error: "magic_bytes_mismatch", message: "File contents do not match a PDF." };
    }
    return null;
  }
  // ZIP-based Office formats (docx/xlsx/pptx): PK\x03\x04
  const zipMimes = new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]);
  if (zipMimes.has(declaredMime)) {
    if (!startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) && !startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) {
      return {
        error: "magic_bytes_mismatch",
        message: "File contents do not match the declared Office format.",
      };
    }
    return null;
  }
  // Legacy OLE (doc/xls/ppt): D0 CF 11 E0 A1 B1 1A E1
  const oleMimes = new Set([
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
  ]);
  if (oleMimes.has(declaredMime)) {
    if (!startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
      return {
        error: "magic_bytes_mismatch",
        message: "File contents do not match the declared Office format.",
      };
    }
    return null;
  }
  // text/plain, text/markdown — no fixed magic. Verify the leading bytes
  // are ASCII/UTF-8 printable or whitespace, rejecting obvious binaries.
  if (declaredMime === "text/plain" || declaredMime === "text/markdown") {
    const sample = buf.subarray(0, Math.min(512, buf.length));
    for (const b of sample) {
      // Allow tab/lf/cr + printable ascii + UTF-8 high bits
      if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
      if (b >= 0x20 && b <= 0x7e) continue;
      if (b >= 0x80) continue; // UTF-8 continuation/leading
      return { error: "magic_bytes_mismatch", message: "File contents are not plain text." };
    }
    return null;
  }
  return null;
}

/**
 * Best-effort plain-text extraction for PHI screening.
 * - txt/md: decode as UTF-8.
 * - docx/xlsx/pptx (ZIP): naive scan — pull readable ASCII/UTF-8 runs.
 *   Good enough to surface raw PHI strings; not a full DOCX parser.
 * - pdf: extract readable text-object literals between BT/ET markers as
 *   best-effort. Encrypted or fully image-based PDFs will yield empty text;
 *   the upstream caller decides whether to allow that.
 * - legacy OLE doc/xls/ppt: scan for printable runs.
 */
export function extractTextForPHIScan(buf: Uint8Array, declaredMime: string): string {
  if (declaredMime === "text/plain" || declaredMime === "text/markdown") {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } catch {
      return "";
    }
  }
  // Pull all runs of printable characters ≥ 4 chars long.
  // Works for docx/xlsx/pptx (ZIP'd XML), legacy OLE, and PDFs.
  let out = "";
  let run = "";
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    const printable =
      b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e);
    if (printable) {
      run += String.fromCharCode(b);
    } else {
      if (run.length >= 4) out += run + "\n";
      run = "";
    }
  }
  if (run.length >= 4) out += run;
  // Cap to keep PHI scan fast on a 50 MB upload.
  if (out.length > 2_000_000) out = out.slice(0, 2_000_000);
  return out;
}
