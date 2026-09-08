import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { buildMillerNorthCareSettingEnrichment, validateMillerNorthCareSettingEnrichment } from "../server/millerNorthCareSettingEnrichment.js"

const publicEvidence = JSON.parse(readFileSync(new URL("../src/data/indigenous-healthcare-evidence-public-v1.json", import.meta.url), "utf8"))
let modelSuggestions = new Map()
try {
  const advisory = JSON.parse(readFileSync(new URL("../artifacts/miller-north/miller-north-care-setting-qwen-sample-2026-09-07.json", import.meta.url), "utf8"))
  modelSuggestions = new Map((advisory.suggestions || []).map(item => [item.public_record_id, item]))
} catch { /* deterministic-only run remains valid */ }
const result = buildMillerNorthCareSettingEnrichment(publicEvidence.records, { modelSuggestions })
validateMillerNorthCareSettingEnrichment(result, publicEvidence.records.map(item => item.public_record_id))
const output = { ...result, generated_at: new Date().toISOString(), publication_scope: "derived_private_review_projection", caution: "Derived classifications do not alter raw evidence. Explicit phrase rules are automatically accepted; conflicts and model suggestions remain reviewable unless they meet the documented evidence-span threshold." }
const publicDerived = { schema_version: "miller-north-care-setting-derived-public-v1", generated_at: output.generated_at, publication_scope: "publication_safe_derived_classifications", records: output.classifications.filter(item => item.review_status === "auto_accepted" && item.setting !== "unclear").map(item => ({ public_record_id: item.public_record_id, care_setting: item.setting, classification_route: item.route, rule_version: item.version })) }
const dir = new URL("../artifacts/miller-north/", import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL("../src/data/miller-north-care-setting-derived-public-v1.json", import.meta.url), `${JSON.stringify(publicDerived, null, 2)}\n`)
writeFileSync(new URL("miller-north-care-setting-enrichment-2026-09-07.json", dir), `${JSON.stringify(output, null, 2)}\n`)
const settings = Object.entries(output.classifications.reduce((counts, item) => ({ ...counts, [item.setting]: (counts[item.setting] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
writeFileSync(new URL("miller-north-care-setting-enrichment-2026-09-07.md", dir), `# Miller North care-setting enrichment\n\nThis is a derived review projection. The 695 source rows are unchanged.\n\n- Existing structured classifications normalized: ${output.existing_structured}\n- Newly classified by explicit deterministic phrase: ${output.deterministic_enriched}\n- Accepted local-model classifications: ${output.model_enriched}\n- Owner review: ${output.owner_review}\n- Still unclassified: ${output.unclassified}\n\n## Derived setting counts\n\n${settings.map(([setting, count]) => `- ${setting}: ${count}`).join("\n")}\n\n## Review rule\n\nA local-model proposal can be auto-accepted only at confidence 0.97 or higher and when its evidence phrase occurs verbatim in the public source text supplied to the classifier. Conflicts remain owner-review items.\n`)
console.log(JSON.stringify({ rows: output.source_rows, deterministic_enriched: output.deterministic_enriched, existing_structured: output.existing_structured, model_enriched: output.model_enriched, owner_review: output.owner_review, unclassified: output.unclassified, settings: Object.fromEntries(settings) }))
