import { readFileSync, writeFileSync } from "node:fs"
import { buildSourceYieldDashboard } from "../server/millerNorthSourceYield.js"

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"))
const historical = readJson("../artifacts/miller-north/miller-north-historical-official-record-backfill-2026-09-07.json")
const ocr = readJson("../artifacts/miller-north/miller-north-bc-inquest-ocr-review-v1.json")
const ocrReview = readJson("../artifacts/miller-north/miller-north-bc-inquest-ocr-owner-review-v1.json")
const ocya = readJson("../artifacts/miller-north/miller-north-alberta-ocya-listener-cycle-v1.json")
const cpsbc = readJson("../artifacts/miller-north/miller-north-cpsbc-case-study-listener-cycle-v1.json")

const counts = ocr.records.reduce((sum, row) => {
  sum[row.classification] = (sum[row.classification] || 0) + 1
  return sum
}, {})
const ocrDispositions = ocrReview.reviewed_candidates.reduce((sum, row) => {
  sum[row.disposition] = (sum[row.disposition] || 0) + 1
  return sum
}, {})
const previous = historical.yield_by_family.filter(row => !["bc_coroner_inquest", "alberta_child_youth_advocate"].includes(row.source_family))
const rows = [
  ...previous,
  {
    source_family: "bc_coroner_inquest_ocr_backlog",
    documents_checked: ocr.records.length,
    useful_qualifying_records: counts.potentially_miller_north_relevant || 0,
    new_verified_incidents: ocrDispositions.published_public_record_and_accountability_chain || 0,
    provisional_leads: ocrDispositions.hold_private_owner_review || 0,
    new_accountability_chains: ocrDispositions.published_public_record_and_accountability_chain || 0,
    duplicates_suppressed: 6,
    rejected_or_noise: (counts.clearly_out_of_scope || 0) + (counts.healthcare_relevant_no_indigenous_relevance_established || 0) + (counts.indigenous_relevant_not_healthcare_relevant || 0) + (ocrDispositions.healthcare_relevant_no_indigenous_relevance_established || 0) + (ocrDispositions.indigenous_relevant_not_healthcare_relevant || 0),
    source_inaccessible: counts.source_inaccessible || 0,
    manual_review_burden: "high: scanned verdicts require OCR plus source-led identity and context verification",
    technical_reliability: "medium: official files are stable when retrievable; scan quality varies",
  },
  {
    source_family: "alberta_child_youth_advocate_recommendations",
    documents_checked: ocya.metrics.rows_checked,
    useful_qualifying_records: ocya.metrics.miller_north_review_rows,
    provisional_leads: ocya.metrics.miller_north_review_rows,
    technical_failures: ocya.errors?.length || 0,
    manual_review_burden: "medium: structured rows parse cleanly; healthcare, Indigenous relevance and implementation claims require source review",
    technical_reliability: "very high: deterministic public table with stable row identities",
  },
  {
    source_family: "cpsbc_indigenous_case_summaries",
    documents_checked: cpsbc.metrics.fetched,
    useful_qualifying_records: cpsbc.metrics.candidates,
    new_verified_incidents: 3,
    manual_review_burden: "low: concise regulator summaries explicitly describe Indigenous relevance and resolution role",
    technical_reliability: "high after index discovery; direct pages may apply anti-bot controls",
  },
  {
    source_family: "held_case_milestone_rechecks",
    documents_checked: 3,
    useful_qualifying_records: 1,
    new_verified_incidents: 1,
    provisional_leads: 2,
    manual_review_burden: "medium: formal process documents must be paired with authoritative Indigenous-context evidence",
    technical_reliability: "high for official milestone pages; Indigenous-context corroboration remains source dependent",
  },
  {
    source_family: "published_official_record_follow_up",
    documents_checked: 14,
    useful_qualifying_records: 1,
    existing_incidents_strengthened: 1,
    accountability_updates: 1,
    manual_review_burden: "medium: each public incident is checked across official, institutional, legal and Indigenous-led source roles",
    technical_reliability: "mixed: source indexes are stable, while recommendation and outcome reporting is fragmented",
  },
]

const dashboard = buildSourceYieldDashboard(rows, { generatedAt: "2026-09-07" })
const jsonUrl = new URL("../artifacts/miller-north/miller-north-source-yield-dashboard-v1.json", import.meta.url)
writeFileSync(jsonUrl, `${JSON.stringify(dashboard, null, 2)}\n`)

const lines = [
  "# Miller North source-yield dashboard v1",
  "",
  "Private owner-review artifact. Rates show observed research yield, not source quality grades. Small samples must be read with their document counts.",
  "",
  "| Source family | Checked | Useful | Public records | Private leads | Strengthened | Watch updates | Duplicates | Rejected | Failures | Public / 100 | Material / 100 |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...dashboard.sources.map(row => `| ${row.source_family} | ${row.documents_checked} | ${row.useful_qualifying_records} | ${row.new_verified_incidents} | ${row.provisional_leads} | ${row.existing_incidents_strengthened} | ${row.accountability_updates} | ${row.duplicates_suppressed} | ${row.rejected_or_noise} | ${row.technical_failures} | ${row.publishable_records_per_100_documents} | ${row.material_evidence_per_100_documents} |`),
  "",
  "## Interpretation",
  "",
  "CPSBC's bounded Indigenous case-summary index currently has the strongest scalable publication yield. The Saskatchewan Advocate sample has high apparent yield but too small a denominator for a stable rate. B.C. scanned inquests and BCCNM archives remain high-value but impose substantially more review work. Zero-yield bounded passes remain useful as negative evidence about where to deprioritize the next cycle.",
  "",
]
writeFileSync(new URL("../artifacts/miller-north/miller-north-source-yield-dashboard-v1.md", import.meta.url), lines.join("\n"))
console.log(JSON.stringify(dashboard.totals, null, 2))
