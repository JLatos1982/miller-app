import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const read = name => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), "utf8"))
const grouped = read("indigenous-healthcare-evidence-groups-public-v1.json").groups
const raw = read("indigenous-healthcare-evidence-public-v1.json").records
const careEnrichment = JSON.parse(readFileSync(new URL("../artifacts/miller-north/miller-north-care-setting-enrichment-2026-09-07.json", import.meta.url), "utf8"))
const provinces = ["british_columbia", "alberta", "saskatchewan", "canada"]
const count = (items, predicate) => items.filter(predicate).length
const matrix = provinces.map(province => ({
  province,
  evidence_groups: count(grouped, item => item.province === province),
  incident_or_reported_groups: count(grouped, item => item.province === province && ["reported_account", "official_investigation", "procedural_adjudicative_context"].includes(item.evidence_status)),
  systemic_groups: count(grouped, item => item.province === province && item.evidence_status === "systemic_evidence"),
  note: "These are public evidence groups, not a count of people, events, or findings."
}))
const careSettings = ["Emergency department care", "Primary health care", "Pregnancy and childbirth care", "Multiple health-care settings", "Health system", "Not applicable — institutional response"]
const careSettingCoverage = careSettings.map(care_setting => ({ care_setting, source_rows: count(raw, item => item.care_setting === care_setting) }))
careSettingCoverage.push({ care_setting: "Not established or uncoded", source_rows: count(raw, item => !item.care_setting) })
const enrichedBySetting = Object.fromEntries(careEnrichment.classifications.reduce((entries, item) => { entries.set(item.setting, (entries.get(item.setting) || 0) + 1); return entries }, new Map()))
const careSettingComparison = {
  before: { coded_rows: count(raw, item => Boolean(item.care_setting)), uncoded_rows: count(raw, item => !item.care_setting) },
  after: { supported_coded_rows: careEnrichment.classifications.filter(item => item.review_status === "auto_accepted" && item.setting !== "unclear").length, owner_review_rows: careEnrichment.owner_review, uncoded_rows: careEnrichment.unclassified },
  derived_by_setting: enrichedBySetting,
  interpretation: "The increase measures recovered metadata from existing public text, not newly discovered incidents. Low counts after enrichment are stronger evidence of a collection gap, while remaining uncoded rows still limit completeness."
}
const searchableText = item => [item.evidence_type, item.evidence_status, item.care_setting, item.organization, item.summary, item.recommendation_action, item.source?.title, item.source?.publisher, item.source?.url].filter(Boolean).join(" ").toLowerCase()
const patterns = [
  { id: "individual_reported_incident", label: "Individual reported incidents", match: item => item.evidence_status === "reported_account" },
  { id: "systemic_research", label: "Systemic research / evidence", match: item => item.evidence_status === "systemic_evidence" },
  { id: "emergency_care", label: "Emergency care", pattern: /\bemergency|emergency department|\ber\b/ },
  { id: "primary_care", label: "Primary care", pattern: /primary (health )?care|family (doctor|physician)|community health centre/ },
  { id: "mental_health_substance_use", label: "Mental health / substance-use care", pattern: /mental health|substance use|addiction|overdose|opioid|detox|withdrawal/ },
  { id: "maternity_reproductive", label: "Maternity / reproductive care", pattern: /pregnan|childbirth|birth care|matern|obstetric|steriliz|tubal ligation/ },
  { id: "rural_remote", label: "Rural / remote care", pattern: /rural|remote|northern communit|reserve hospital|medical travel|medevac/ },
  { id: "ambulance_paramedic", label: "Ambulance / paramedic care", pattern: /ambulance|paramedic|emergency medical service|\bems\b/ },
  { id: "hospital_security", label: "Hospital security", pattern: /hospital security|security guard|protective services|use of force/ },
  { id: "death_serious_harm", label: "Death / serious-harm reports", pattern: /\bdied\b|\bdeath\b|fatal|serious harm|critical incident|stillborn/ },
  { id: "human_rights_legal", label: "Human-rights / legal proceedings", pattern: /human rights|tribunal|court|lawsuit|litigation|judicial|legal proceeding|class action/ },
  { id: "institutional_response", label: "Institutional responses", pattern: /institutional response|official response|apolog|investigat|review announced|policy action|corrective action/ },
  { id: "indigenous_led_reporting", label: "Indigenous-led reporting / governance source", pattern: /first nations health authority|first nations health ombudsperson|federation of sovereign indigenous nations|métis nation|metis nation|aptn|indiginews|nation[- ]led|indigenous[- ]led/ }
]
const dimensionMatrix = patterns.map(({ id, label, pattern, match }) => {
  const matching = grouped.filter(item => match ? match(item) : pattern.test(searchableText(item)))
  return { id, label, total_groups: matching.length, by_geography: Object.fromEntries(provinces.map(province => [province, matching.filter(item => item.province === province).length])), coding_note: "A group is counted only when its saved public fields explicitly support this category; zero or low counts may reflect missing coding rather than absent events." }
})
const report = {
  schema_version: "miller-north-coverage-gap-report-v1",
  assessed_on: "2026-09-07",
  scope: "Public evidence-library coverage only; individual incidents and systemic sources remain distinct.",
  province_matrix: matrix,
  care_setting_source_row_coverage: careSettingCoverage,
  care_setting_before_after: careSettingComparison,
  dimension_group_coverage: dimensionMatrix,
  source_rows_total: raw.length,
  province_search_priorities: [
    { province: "British Columbia", priority: "Northern, rural and emergency-care incident follow-up", queries: ["named northern health facility + First Nations patient + review outcome", "site:fnha.ca named case study + health authority response", "B.C. patient-care-quality or coroner source + Indigenous patient + ambulance"] },
    { province: "Alberta", priority: "Direct accountability outcomes for known incidents", queries: ["named Alberta hospital incident + regulator disposition", "Alberta Indigenous Patient Safety Investigator + aggregate outcomes", "Alberta human-rights source + Indigenous patient + health care"] },
    { province: "Saskatchewan", priority: "Hospital security and FNHO-linked follow-up", queries: ["Saskatchewan hospital security independent review report", "named critical incident + SHA corrective action", "FNHO recommendation + Ministry or SHA response"] }
  ],
  gaps: [
    { area: "Care setting", finding: "Most source rows have no deterministic care-setting code, so setting comparisons are incomplete.", next_search: "Use province + setting query templates and preserve whether a source actually identifies the setting." },
    { area: "Recent individual accounts", finding: "The current library is weighted toward systemic and documentary evidence; public-report leads require ongoing corroboration and reconciliation.", next_search: "Review Indigenous journalism, regional reporting and official follow-up for each province." },
    { area: "Mental health, substance use, ambulance, security and serious-harm contexts", finding: "These themes are not comprehensively coded in the current public projection.", next_search: "Run bounded theme-specific searches; do not infer theme coverage from a generic health-system source." },
    { area: "Outcome and accountability evidence", finding: "Public evidence of activity is often available before recommendation-level implementation or outcome evidence.", next_search: "Seek annual reports, response ledgers, review findings, tribunal decisions and regulator dispositions." }
  ],
  interpretation_limits: ["No cell measures prevalence, frequency, or comparative performance.", "An absence of a record or code is not evidence that an event, service, response, or outcome did not occur.", "National material is retained in the Canada row and is not silently assigned to a province."]
}
const dir = new URL("../artifacts/miller-north/", import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL("miller-north-coverage-gap-report-2026-09-07.json", dir), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(new URL("miller-north-coverage-gap-report-2026-09-07.md", dir), `# Miller North coverage-gap report\n\nAssessment date: ${report.assessed_on}. This is a coverage map of public evidence, not an incident or population count.\n\n## Province matrix\n\n| Province | Evidence groups | Incident/report-context groups | Systemic groups |\n| --- | ---: | ---: | ---: |\n${matrix.map(row => `| ${row.province.replaceAll("_", " ")} | ${row.evidence_groups} | ${row.incident_or_reported_groups} | ${row.systemic_groups} |`).join("\n")}\n\n## Requested coverage dimensions\n\nThese counts are deterministic text/status coding over the saved public evidence groups. They show documented coverage, not prevalence; an uncoded source may still relate to a category.\n\n| Dimension | B.C. | Alberta | Saskatchewan | Canada | Total |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${dimensionMatrix.map(row => `| ${row.label} | ${row.by_geography.british_columbia} | ${row.by_geography.alberta} | ${row.by_geography.saskatchewan} | ${row.by_geography.canada} | ${row.total_groups} |`).join("\n")}\n\n## Care-setting coding\n\n${careSettingCoverage.map(row => `- ${row.care_setting}: ${row.source_rows} of ${raw.length} source rows`).join("\n")}\n\n## Highest-value next searches\n\n${report.province_search_priorities.map(item => `### ${item.province}\n\n**${item.priority}.**\n\n${item.queries.map(query => `- ${query}`).join("\n")}`).join("\n\n")}\n\n## Priority gaps\n\n${report.gaps.map(gap => `### ${gap.area}\n\n${gap.finding} Next: ${gap.next_search}`).join("\n\n")}\n\n## Interpretation limits\n\n${report.interpretation_limits.map(limit => `- ${limit}`).join("\n")}\n`)
writeFileSync(new URL("miller-north-coverage-gap-after-enrichment-2026-09-07.md", dir), `# Miller North coverage after care-setting enrichment\n\n- Before: ${careSettingComparison.before.coded_rows} coded rows; ${careSettingComparison.before.uncoded_rows} uncoded rows.\n- After explicit-field and phrase recovery: ${careSettingComparison.after.supported_coded_rows} supported coded rows; ${careSettingComparison.after.owner_review_rows} conflicts queued for review; ${careSettingComparison.after.uncoded_rows} still uncoded.\n- Derived settings: ${Object.entries(enrichedBySetting).sort((a,b)=>b[1]-a[1]).map(([setting,count]) => `${setting} ${count}`).join(", ")}.\n\n${careSettingComparison.interpretation}\n\nHospital-security, mental-health/substance-use, and public-health settings remain especially thin after deterministic recovery. Ambulance/paramedic and rural/remote evidence is present but sparse. These should receive source-specific discovery rather than more generic searching.\n`)
console.log(JSON.stringify({ sourceRows: raw.length, groups: grouped.length, matrix, dimensions: dimensionMatrix.map(({ id, total_groups }) => ({ id, total_groups })), before: careSettingComparison.before, after: careSettingComparison.after }))
