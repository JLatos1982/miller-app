import { writeFile } from "node:fs/promises"

import millerFunding from "../src/data/miller-funding-assistance-public-v1.json" with { type: "json" }
import millerSupports from "../src/data/miller-practical-supports-public-v1.json" with { type: "json" }
import northFunding from "../src/data/miller-north-funding-assistance-public-v1.json" with { type: "json" }
import northSupports from "../src/data/miller-north-first-nations-supports-public-v1.json" with { type: "json" }
import sharedAdditions from "../src/data/miller-shared-resource-additions-v1.json" with { type: "json" }
import { buildSharedResourceRegistry, validateSharedResourceRegistry } from "../server/sharedResourceRegistry.js"

const records = buildSharedResourceRegistry([
  { project: "miller", sourceKind: "service", records: millerSupports.records },
  { project: "miller", sourceKind: "funding", records: millerFunding.records },
  { project: "miller_north", sourceKind: "service", records: northSupports.records },
  { project: "miller_north", sourceKind: "funding", records: northFunding.records },
  { project: "miller", sourceKind: "service", records: sharedAdditions.records },
  { project: "miller_north", sourceKind: "service", records: sharedAdditions.records },
])
const registry = {
  schema_version: "miller-shared-resource-registry-v1",
  generated_at: "2026-09-07",
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
