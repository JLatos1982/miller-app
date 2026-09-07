import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"

import { analyzeHistoricalOfficialRecord, summarizeHistoricalBackfill } from "../server/millerNorthHistoricalBackfill.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifactDir = resolve(root, "artifacts/miller-north")
const memoryPath = resolve(artifactDir, "miller-north-bc-inquest-listener-memory-v1.json")
const outputPath = resolve(artifactDir, "miller-north-historical-backfill-2010-2023-v1.json")
const reportPath = resolve(artifactDir, "miller-north-historical-backfill-2010-2023-v1.md")
const args = process.argv.slice(2)
const after = flag => args[args.indexOf(flag) + 1]
const limit = Math.min(300, Math.max(1, Number(after("--limit")) || 200))
const checkedAt = new Date().toISOString()
const standardFontDataUrl = new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href

async function extractPdfText(bytes) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false, standardFontDataUrl }).promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 80); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map(item => item.str).join(" "))
  }
  return pages.join(" ").replace(/\s+/g, " ").trim()
}

const memory = JSON.parse(readFileSync(memoryPath, "utf8"))
const selected = Object.entries(memory.documents || {})
  .map(([document_id, item]) => ({ document_id, ...item, source_role: "jury_verdict" }))
  .filter(item => item.year >= 2010 && item.year <= 2023)
  .sort((a, b) => a.year - b.year || a.url.localeCompare(b.url))
  .slice(0, limit)

let cursor = 0
const records = []
await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
  while (cursor < selected.length) {
    const item = selected[cursor++]
    try {
      const response = await fetch(item.url, { redirect: "follow", signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`http_${response.status}`)
      const text = await extractPdfText(Buffer.from(await response.arrayBuffer()))
      records.push({ ...analyzeHistoricalOfficialRecord(item, text), checked_at: checkedAt })
    } catch (error) {
      records.push({ ...item, checked_at: checkedAt, date_band: item.year >= 2018 ? "2018_2023" : item.year >= 2014 ? "2014_2017" : "2010_2013", extraction_status: "fetch_or_parse_failed", disposition: "manual_extraction_review", error: String(error?.message || error) })
    }
  }
}))
records.sort((a, b) => a.year - b.year || a.url.localeCompare(b.url))
const metrics = summarizeHistoricalBackfill(records)
metrics.fetch_or_parse_failed = records.filter(item => item.extraction_status === "fetch_or_parse_failed").length
const candidates = records.filter(item => item.disposition === "owner_review").map(item => ({
  document_id: item.document_id,
  url: item.url,
  person_or_event: item.person_or_event,
  year: item.year,
  date_band: item.date_band,
  indigenous_terms: item.indigenous_terms,
  mechanism_tags: item.mechanism_tags,
  evidence_excerpt: item.evidence_excerpt,
  disposition: item.disposition,
}))
const manualReview = records.filter(item => item.disposition === "manual_extraction_review").map(item => ({ document_id: item.document_id, url: item.url, person_or_event: item.person_or_event, year: item.year, extraction_status: item.extraction_status }))
const output = {
  schema_version: "miller-north-historical-backfill-v1",
  checked_at: checkedAt,
  scope: { province: "British Columbia", years: [2010, 2023], source_family: "coroner_inquest", production_writes: 0 },
  metrics,
  candidates,
  manual_review: manualReview,
  rules: [
    "Selection requires explicit Indigenous terminology in extracted document text plus a healthcare or serious-harm mechanism term.",
    "A selected document is an owner-review candidate, not a verified incident or finding of racism.",
    "Names, surnames and locations are never used to infer Indigenous identity.",
    "Unreadable scanned documents remain visible in an OCR/manual-review queue rather than being silently rejected.",
  ],
}
mkdirSync(artifactDir, { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
writeFileSync(reportPath, `# Miller North historical B.C. inquest backfill (2010–2023)\n\nChecked: ${checkedAt}\n\n- Documents reviewed: ${metrics.documents_reviewed}\n- Deterministic owner-review candidates: ${metrics.owner_review}\n- Scanned/text-unavailable documents needing OCR or manual review: ${metrics.ocr_required}\n- Fetch/parse failures: ${metrics.fetch_or_parse_failed}\n- Rejected by bounded deterministic triage: ${metrics.rejected_by_deterministic_triage}\n\n## Date-band coverage\n\n${Object.entries(metrics.by_date_band).map(([band, count]) => `- ${band.replaceAll("_", "–")}: ${count}`).join("\n")}\n\n## Interpretation\n\nA match is a research lead only. Publication still requires event reconciliation, authoritative Indigenous relevance, source-role review, privacy review and owner/publication approval. Scanned verdicts are not treated as negative results.\n`)
console.log(JSON.stringify(metrics, null, 2))
