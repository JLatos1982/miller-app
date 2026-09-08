import { mkdir, writeFile } from "node:fs/promises"

import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }

const outputDirectory = new URL("../artifacts/miller-resources/", import.meta.url)
const provinces = ["British Columbia", "Alberta", "Saskatchewan", "Canada-wide"]
const dimensions = {
  healthcare: record => record.categories.includes("healthcare"),
  addiction_substance_use: record => /substance|addiction|detox|treatment|harm reduction|recovery/.test(`${record.subcategories.join(" ")} ${record.description}`.toLowerCase()),
  housing: record => record.categories.includes("housing"),
  legal_rights: record => record.categories.includes("legal_rights"),
  funding: record => record.categories.includes("financial_funding"),
  medical_transportation: record => Boolean(record.transportation) || /medical transport|medical travel|patient transport/.test(`${record.program_name} ${record.description} ${record.subcategories.join(" ")}`.toLowerCase()),
  mental_health: record => /mental health|counselling|psychiatr/.test(`${record.program_name} ${record.description} ${record.subcategories.join(" ")}`.toLowerCase()),
  family_youth: record => record.categories.includes("family_community") || /family|youth|child|elder/.test(`${record.program_name} ${record.description} ${record.population_served}`.toLowerCase()),
  practical_basic_needs: record => record.categories.includes("practical_support") || /food|clothing|identification|basic needs|income support/.test(`${record.program_name} ${record.description}`.toLowerCase()),
}
const indigenousLed = record => /indigenous_led|tribal_council|metis_government|first_nations_governed/.test(record.governance_type)
const ruralRemote = record => /rural|remote|northern|community/.test(`${record.service_area} ${record.description} ${record.subcategories.join(" ")}`.toLowerCase())

const north = registry.records.filter(record => record.project_visibility.includes("miller_north"))
const matrix = Object.fromEntries(provinces.map(province => {
  const records = north.filter(record => record.province === province)
  return [province, {
    total: records.length,
    ...Object.fromEntries(Object.entries(dimensions).map(([key, predicate]) => [key, records.filter(predicate).length])),
    indigenous_led: records.filter(indigenousLed).length,
    verified_active: records.filter(record => record.verification_status === "verified_active").length,
    rural_remote: records.filter(ruralRemote).length,
  }]
}))
const report = {
  schema_version: "miller-resource-gap-report-v1",
  generated_at: "2026-09-07",
  counts: {
    canonical_total: registry.records.length,
    miller: registry.records.filter(record => record.project_visibility.includes("miller")).length,
    miller_north: north.length,
    miller_only: registry.records.filter(record => record.project_visibility.join(",") === "miller").length,
    miller_north_only: registry.records.filter(record => record.project_visibility.join(",") === "miller_north").length,
    both: registry.records.filter(record => record.project_visibility.length === 2).length,
  },
  matrix,
  next_gap: "Alberta and Saskatchewan rural/remote housing access beyond the major urban providers remains the thinnest verified practical lane.",
}
const markdown = [
  "# Miller shared resource gap matrix",
  "",
  `Generated ${report.generated_at}. Private owner planning artifact; not a public resource projection.`,
  "",
  `Canonical ${report.counts.canonical_total} · Miller ${report.counts.miller} · Miller North ${report.counts.miller_north} · shared ${report.counts.both}`,
  "",
  `| Province/scope | Total | Health | Housing | Legal | Funding | Medical travel | Mental health | Family/youth | Practical | Indigenous-led | Rural/remote |`,
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...provinces.map(province => {
    const row = matrix[province]
    return `| ${province} | ${row.total} | ${row.healthcare} | ${row.housing} | ${row.legal_rights} | ${row.funding} | ${row.medical_transportation} | ${row.mental_health} | ${row.family_youth} | ${row.practical_basic_needs} | ${row.indigenous_led} | ${row.rural_remote} |`
  }),
  "",
  `Highest-value next gap: ${report.next_gap}`,
  "",
].join("\n")

await mkdir(outputDirectory, { recursive: true })
await writeFile(new URL("miller-shared-resource-gap-matrix-2026-09-07.json", outputDirectory), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(new URL("miller-shared-resource-gap-matrix-2026-09-07.md", outputDirectory), markdown)
console.log(JSON.stringify(report.counts))
