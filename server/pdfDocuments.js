import { createHash } from "node:crypto"

export const PDF_MIME = "application/pdf"
export const MAX_PDF_BYTES = 12 * 1024 * 1024

export function safePdfFilename(value, fallback = "printable-guide.pdf") {
  const cleaned = String(value || "").normalize("NFKD").replace(/[^a-zA-Z0-9._ -]+/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 120)
  const base = cleaned.toLowerCase().endsWith(".pdf") ? cleaned.slice(0, -4) : cleaned
  return `${base || fallback.replace(/\.pdf$/i, "")}.pdf`
}

export function validatePdfBuffer(buffer, { maxBytes = MAX_PDF_BYTES } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 64) return { ok: false, code: "invalid_pdf", error: "Upload a valid PDF document." }
  if (buffer.length > maxBytes) return { ok: false, code: "pdf_too_large", error: "PDF files must be no larger than 12 MB." }
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) return { ok: false, code: "invalid_pdf_signature", error: "The file does not have a valid PDF signature." }
  const source = buffer.toString("latin1")
  if (/\/Encrypt\b/.test(source)) return { ok: false, code: "encrypted_pdf", error: "Encrypted or password-protected PDFs cannot be uploaded." }
  if (!/\/Type\s*\/Catalog\b/.test(source) || !/\/Type\s*\/Pages\b/.test(source) || !/%%EOF\s*$/.test(source)) return { ok: false, code: "malformed_pdf", error: "The PDF is malformed or incomplete." }
  const startXref = source.match(/startxref\s+(\d+)\s+%%EOF\s*$/)
  if (!startXref || Number(startXref[1]) < 0 || Number(startXref[1]) >= buffer.length) return { ok: false, code: "malformed_pdf", error: "The PDF cross-reference data is invalid." }
  const pageCount = (source.match(/\/Type\s*\/Page\b/g) || []).length
  if (!pageCount) return { ok: false, code: "malformed_pdf", error: "The PDF contains no displayable pages." }
  return { ok: true, pageCount, fileSizeBytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") }
}

export function pdfDisposition(value, filename) {
  const mode = value === "attachment" ? "attachment" : "inline"
  const ascii = safePdfFilename(filename).replace(/["\\]/g, "")
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(ascii)}`
}

export function requestedPdfByteRange(value, size) {
  const match = String(value || "").match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return value ? null : undefined
  let start = match[1] ? Number(match[1]) : null, end = match[2] ? Number(match[2]) : null
  if (start === null && end !== null) { start = Math.max(0, size - end); end = size - 1 }
  else { start ??= 0; end ??= size - 1 }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}
