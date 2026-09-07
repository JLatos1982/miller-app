import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { classifyBcInquestOcr, summarizeBcInquestOcr } from "../server/millerNorthBcInquestOcr.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifactDir = resolve(root, "artifacts/miller-north")
const sourcePath = resolve(artifactDir, "miller-north-historical-backfill-2010-2023-v1.json")
const outputPath = resolve(artifactDir, "miller-north-bc-inquest-ocr-review-v1.json")
const helperSource = resolve(root, "scripts/miller-north-macos-vision-ocr.swift")
const args = process.argv.slice(2)
const after = flag => args[args.indexOf(flag) + 1]
const offset = Math.max(0, Number(after("--offset")) || 0)
const limit = Math.min(49, Math.max(1, Number(after("--limit")) || 49))
const checkedAt = new Date().toISOString()

const source = JSON.parse(readFileSync(sourcePath, "utf8"))
const prior = (() => { try { return JSON.parse(readFileSync(outputPath, "utf8")) } catch { return { records: [] } } })()
const byId = new Map((prior.records || []).map(item => [item.document_id, item]))
const selected = source.manual_review.slice(offset, offset + limit).filter(item => !byId.has(item.document_id) || args.includes("--force"))
const runDir = mkdtempSync(resolve(tmpdir(), "miller-north-bc-ocr-"))
const helperBinary = resolve(runDir, "vision-ocr")

execFileSync("swiftc", [helperSource, "-o", helperBinary], { stdio: "inherit" })

function persistSnapshot() {
  const records = [...byId.values()].sort((a, b) => a.year - b.year || a.person_or_event.localeCompare(b.person_or_event))
  const output = {
    schema_version: "miller-north-bc-inquest-ocr-review-v1",
    checked_at: checkedAt,
    scope: { source_family: "bc_coroner_inquest", expected_scans: source.manual_review.length, production_writes: 0 },
    metrics: summarizeBcInquestOcr(records, source.manual_review.length),
    records,
    rules: [
      "OCR text is a research aid and does not replace visual/source verification.",
      "Indigenous relevance requires explicit public document language or later authoritative corroboration; names and geography are never used to infer identity.",
      "Potential matches remain private until event reconciliation, outward investigation, privacy review and publication approval are complete.",
    ],
  }
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  return output
}

let cursor = 0
async function fetchPublicPdf(url) {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`ocr_pdf_fetch_${response.status}:${url}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

try {
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async (_, workerIndex) => {
    while (cursor < selected.length) {
      const index = cursor++
      const item = selected[index]
      const documentDir = resolve(runDir, `worker-${workerIndex}-document-${String(index).padStart(3, "0")}`)
      mkdirSync(documentDir, { recursive: true })
      try {
        const pdfPath = resolve(documentDir, "source.pdf")
        writeFileSync(pdfPath, await fetchPublicPdf(item.url))
        const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" })
        const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]) || null
        const prefix = resolve(documentDir, "page")
        execFileSync("pdftoppm", ["-png", "-r", "175", pdfPath, prefix], { stdio: "ignore" })
        const pageFiles = readdirSync(documentDir).filter(name => /^page-\d+\.png$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        const pageTexts = pageFiles.map(name => execFileSync(helperBinary, [resolve(documentDir, name)], { encoding: "utf8", maxBuffer: 12 * 1024 * 1024 }))
        const record = classifyBcInquestOcr(item, pageTexts.join("\n\n"), { pageCount })
        byId.set(item.document_id, { ...record, checked_at: checkedAt })
        const output = persistSnapshot()
        console.log(`${output.metrics.scans_reviewed}/${source.manual_review.length} ${item.person_or_event}: ${record.classification}`)
      } catch (error) {
        byId.set(item.document_id, {
          ...item,
          document_quality: "unreadable",
          classification: "source_inaccessible",
          requires_outward_investigation: false,
          publication_status: "private_review_only",
          error: String(error?.message || error),
          checked_at: checkedAt,
        })
        const output = persistSnapshot()
        console.error(`${output.metrics.scans_reviewed}/${source.manual_review.length} ${item.person_or_event}: source_inaccessible`)
      } finally {
        rmSync(documentDir, { recursive: true, force: true })
      }
    }
  }))
} finally {
  rmSync(runDir, { recursive: true, force: true })
}

const output = persistSnapshot()
console.log(JSON.stringify(output.metrics, null, 2))
