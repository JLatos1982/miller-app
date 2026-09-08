import { writeFile } from "node:fs/promises"

import millerFunding from "../src/data/miller-funding-assistance-public-v1.json" with { type: "json" }
import millerSupports from "../src/data/miller-practical-supports-public-v1.json" with { type: "json" }
import northFunding from "../src/data/miller-north-funding-assistance-public-v1.json" with { type: "json" }
import northSupports from "../src/data/miller-north-first-nations-supports-public-v1.json" with { type: "json" }
import sharedAdditions from "../src/data/miller-shared-resource-additions-v1.json" with { type: "json" }
import sharedExpansion from "../src/data/miller-shared-resource-expansion-2026-09-07.json" with { type: "json" }
import sharedLegalExpansion from "../src/data/miller-shared-legal-resource-expansion-2026-09-07.json" with { type: "json" }
import sharedInstitutionalExpansion from "../src/data/miller-shared-institutional-resource-expansion-2026-09-08.json" with { type: "json" }
import westernMobileExpansion from "../src/data/miller-western-mobile-expansion-2026-09-08.json" with { type: "json" }
import reconciliationExpansion from "../src/data/miller-shared-resource-reconciliation-2026-09-08.json" with { type: "json" }
import westernRegionalPathways from "../src/data/miller-western-regional-pathways-2026-09-08.json" with { type: "json" }
import westernPrioritySeams from "../src/data/miller-western-priority-seams-2026-09-08.json" with { type: "json" }
import legacyPriorityVerification from "../src/data/miller-legacy-priority-verification-2026-09-08.json" with { type: "json" }
import legacyPriorityVerificationV2 from "../src/data/miller-legacy-priority-verification-v2-2026-09-08.json" with { type: "json" }
import canadaFoundation from "../src/data/miller-canada-foundation-2026-09-08.json" with { type: "json" }
import { buildSharedResourceRegistry, validateSharedResourceRegistry } from "../server/sharedResourceRegistry.js"

const withDefaultProvince = (records, defaultProvince, overrides = {}) => records.map(record => ({
  ...record,
  province: record.province || overrides[record.id] || defaultProvince,
}))

const records = buildSharedResourceRegistry([
  {
    project: "miller",
    sourceKind: "service",
    records: withDefaultProvince(millerSupports.records, "British Columbia", {
      "support:plan-institute-disability-planning-helpline": "Canada-wide",
      "support:hope-air-travel-support": "Canada-wide",
    }),
  },
  { project: "miller", sourceKind: "funding", records: millerFunding.records },
  { project: "miller_north", sourceKind: "service", records: northSupports.records },
  { project: "miller_north", sourceKind: "funding", records: northFunding.records },
  { project: "miller", sourceKind: "service", records: sharedAdditions.records },
  { project: "miller_north", sourceKind: "service", records: sharedAdditions.records },
  { project: "miller", sourceKind: "service", records: sharedExpansion.records.filter(record => record.project_visibility.includes("miller")) },
  { project: "miller_north", sourceKind: "service", records: sharedExpansion.records.filter(record => record.project_visibility.includes("miller_north")) },
  { project: "miller", sourceKind: "service", records: sharedLegalExpansion.records.filter(record => record.project_visibility.includes("miller")) },
  { project: "miller_north", sourceKind: "service", records: sharedLegalExpansion.records.filter(record => record.project_visibility.includes("miller_north")) },
  { project: "miller", sourceKind: "service", records: sharedInstitutionalExpansion.records.filter(record => record.project_visibility.includes("miller")) },
  { project: "miller_north", sourceKind: "service", records: sharedInstitutionalExpansion.records.filter(record => record.project_visibility.includes("miller_north")) },
  { project: "miller", sourceKind: "service", records: westernMobileExpansion.records },
  { project: "miller", sourceKind: "service", records: reconciliationExpansion.records.filter(record => record.project_visibility.includes("miller")) },
  { project: "miller_north", sourceKind: "service", records: reconciliationExpansion.records.filter(record => record.project_visibility.includes("miller_north")) },
  { project: "miller", sourceKind: "funding", records: reconciliationExpansion.funding_records.filter(record => record.project_visibility.includes("miller")) },
  { project: "miller_north", sourceKind: "funding", records: reconciliationExpansion.funding_records.filter(record => record.project_visibility.includes("miller_north")) },
  { project: "miller", sourceKind: "service", records: westernRegionalPathways.records.filter(record => record.project_visibility.includes("miller")) },
  { project: "miller_north", sourceKind: "service", records: westernRegionalPathways.records.filter(record => record.project_visibility.includes("miller_north")) },
  { project: "miller", sourceKind: "service", records: westernPrioritySeams.records.filter(record => record.project_visibility.includes("miller")) },
  { project: "miller_north", sourceKind: "service", records: westernPrioritySeams.records.filter(record => record.project_visibility.includes("miller_north")) },
  { project: "miller", sourceKind: "service", records: legacyPriorityVerification.records },
  { project: "miller", sourceKind: "service", records: legacyPriorityVerificationV2.records },
  { project: "miller", sourceKind: "service", records: canadaFoundation.records.filter(record => record.project_visibility.includes("miller")) },
  { project: "miller_north", sourceKind: "service", records: canadaFoundation.records.filter(record => record.project_visibility.includes("miller_north")) },
])
const registry = {
  schema_version: "miller-shared-resource-registry-v1",
  generated_at: "2026-09-08",
  publication_boundary: "Public-source records only. Project-specific projections remain distinct.",
  taxonomy: {
    healthcare: ["primary care", "patient navigation", "mental health", "substance use", "medical travel", "community health"],
    housing: ["emergency shelter", "transitional housing", "supportive housing", "rent assistance", "housing navigation"],
    legal_rights: ["legal aid", "human rights", "complaint navigation", "patient advocacy", "ombuds services"],
    financial_funding: ["benefits", "emergency assistance", "medical travel", "treatment", "housing", "education and training", "community grants"],
    family_community: ["youth", "families", "Elders", "cultural support", "community navigation"],
    practical_support: ["transportation", "food", "identification", "income navigation", "employment and training"],
  },
  records,
}
validateSharedResourceRegistry(registry)
await writeFile(new URL("../src/data/miller-shared-resource-registry-v1.json", import.meta.url), `${JSON.stringify(registry, null, 2)}\n`)
console.log(JSON.stringify(validateSharedResourceRegistry(registry)))
