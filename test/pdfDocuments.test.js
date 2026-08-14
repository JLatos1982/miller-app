import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { MAX_PDF_BYTES, pdfDisposition, safePdfFilename, validatePdfBuffer } from "../server/pdfDocuments.js"

const files = [
  ["Recovery_Support_Resources_Public.pdf", "2508f711d3d1b9f3dba9ce96b07f24f8e8781063f514fc93004f18a391f9f2c6"],
  ["Recovery_Support_Resources_Fraser_North_Public.pdf", "93f3faf4ae0a230cb4a377b7c6cdd5fa60f722153b11e65c90f7af0c5fbcc664"],
  ["Recovery_Support_Resources_Fraser_East_Public.pdf", "e0212836adf3619aef9dc5c0f7e131cb56c8569b574ccf098b5282b57a2e048c"],
]

test("the three regional source PDFs remain separate, valid, unencrypted one-page documents", () => {
  for (const [filename, sha256] of files) {
    const result = validatePdfBuffer(fs.readFileSync(new URL(`../${filename}`, import.meta.url)))
    assert.equal(result.ok, true); assert.equal(result.pageCount, 1); assert.equal(result.sha256, sha256)
  }
  assert.equal(new Set(files.map(([, hash]) => hash)).size, 3)
})

test("PDF validation rejects wrong signatures, malformed, encrypted, page-less, and oversized payloads", () => {
  const valid = Buffer.from("%PDF-1.4\n1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj\n2 0 obj<</Type /Pages /Count 1 /Kids[3 0 R]>>endobj\n3 0 obj<</Type /Page /Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Root 1 0 R /Size 4>>\nstartxref\n150\n%%EOF")
  assert.equal(validatePdfBuffer(valid).ok, true)
  assert.equal(validatePdfBuffer(Buffer.from("not a pdf")).code, "invalid_pdf")
  assert.equal(validatePdfBuffer(Buffer.concat([valid.subarray(0, -5), Buffer.from("broken")])).code, "malformed_pdf")
  assert.equal(validatePdfBuffer(Buffer.from(valid.toString("latin1").replace("/Catalog", "/Catalog /Encrypt 4 0 R"), "latin1")).code, "encrypted_pdf")
  assert.equal(validatePdfBuffer(Buffer.from(valid.toString("latin1").replace("/Page /Parent", "/Other /Parent"), "latin1")).code, "malformed_pdf")
  assert.equal(validatePdfBuffer(Buffer.alloc(MAX_PDF_BYTES + 1, 1)).code, "pdf_too_large")
})

test("download filenames and content disposition are safe and PDF-only", () => {
  assert.equal(safePdfFilename("../../Recovery Guide.PDF"), "Recovery Guide.pdf")
  assert.match(pdfDisposition("attachment", "Recovery Guide.pdf"), /^attachment;/)
  assert.match(pdfDisposition("inline", "Recovery Guide.pdf"), /^inline;/)
})

test("forward migration adds PDF documents without mutating the counselling list or structured history", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608150003_add_pdf_curated_documents.sql", import.meta.url), "utf8")
  assert.match(sql, /content_type text not null default 'structured_list'/)
  assert.match(sql, /'structured_list','pdf_document'/)
  assert.match(sql, /'draft','published','unpublished','archived'/)
  assert.match(sql, /curated_list_document_revisions/)
  assert.match(sql, /on delete restrict/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /revoke all .* from public, anon, authenticated/)
  assert.match(sql, /'curated-list-documents'.*false.*12582912.*application\/pdf/s)
  assert.match(sql, /Intentionally no storage\.objects policies/)
  assert.doesNotMatch(sql, /low-cost-community-counselling-options|delete from public\.curated_list|truncate|trusted_bulk_import_curated_list/)
})

test("server keeps structured rendering while gating PDF delivery and management", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/lists\/:slug"/)
  assert.match(server, /app\.get\("\/api\/lists\/:slug\/pdf"/)
  assert.match(server, /\.eq\("content_type", "pdf_document"\)\.eq\("status", "published"\)/)
  assert.match(server, /app\.post\("\/api\/admin\/curated-list-documents"[^\n]*requireAdmin/)
  assert.match(server, /app\.put\("\/api\/admin\/curated-list-documents\/:id\/pdf"[^\n]*requireAdmin/)
  assert.match(server, /app\.get\("\/api\/admin\/curated-list-documents\/:id\/pdf", requireAdmin/)
  assert.match(server, /curated_list_sections/)
  assert.match(server, /previous_storage_retained: true/)
})

test("public and administrator UIs distinguish PDF documents from structured lists", () => {
  const publicUi = fs.readFileSync(new URL("../src/lists/PreMadeLists.jsx", import.meta.url), "utf8")
  const adminUi = fs.readFileSync(new URL("../src/admin/PdfDocumentManager.jsx", import.meta.url), "utf8")
  assert.match(publicUi, /selected\.sections\.map/)
  assert.match(publicUi, /Printable PDF/)
  assert.match(publicUi, /Open PDF/)
  assert.match(publicUi, /Download/)
  assert.match(publicUi, /Print PDF/)
  assert.match(publicUi, /Resource details may change/)
  assert.match(adminUi, /Add PDF document/)
  assert.match(adminUi, /Upload as draft/)
  assert.match(adminUi, /Replace PDF/)
  assert.match(adminUi, /Unpublish/)
  assert.match(adminUi, /Archive/)
  assert.doesNotMatch(adminUi, /trusted-bulk-import|canonical_resource|list_import_items/)
})
