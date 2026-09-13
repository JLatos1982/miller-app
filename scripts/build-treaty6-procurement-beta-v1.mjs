import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

import { buildTreaty6ProcurementBeta } from "../server/treaty6ProcurementBeta.js"

const root = process.cwd()
const generatedAt = new Date().toISOString()
const references = Object.freeze({
  dataset: "artifacts/samwise/data-foundry/treaty6-procurement-intelligence-v1/treaty6-procurement-dataset-private.json",
  monitor_snapshot: "artifacts/samwise/data-foundry/indigenous-procurement-opportunity-monitor-30d-v1/latest-snapshot-private.json",
  source_registry: "artifacts/samwise/data-foundry/indigenous-procurement-opportunity-monitor-30d-v1/source-registry-private.json",
  buyer_registry: "artifacts/samwise/data-foundry/treaty6-procurement-intelligence-v1/buyer-registry-private.json",
  geography_model: "artifacts/samwise/data-foundry/treaty6-procurement-intelligence-v1/geographic-model-private.json",
  change_feed: "artifacts/samwise/data-foundry/indigenous-procurement-opportunity-monitor-30d-v1/daily-change-feed-private.json",
})
const outputDirectory = path.join(root, "artifacts", "samwise", "data-foundry", "treaty6-procurement-beta-v1")
const publicOutput = path.join(root, "src", "data", "treaty6-procurement-beta-public-v1.json")
const read = reference => JSON.parse(readFileSync(path.join(root, reference), "utf8"))
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
const atomic = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const payload = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`
  const temporary = `${file}.tmp`
  writeFileSync(temporary, payload, { mode: file.startsWith(path.join(root, "src")) ? 0o644 : 0o600 })
  renameSync(temporary, file)
}

const built = buildTreaty6ProcurementBeta({
  dataset: read(references.dataset),
  monitor_snapshot: read(references.monitor_snapshot),
  source_registry: read(references.source_registry),
  buyer_registry: read(references.buyer_registry),
  geography_model: read(references.geography_model),
  change_feed: read(references.change_feed),
  generated_at: generatedAt,
})

atomic(publicOutput, built.model)

const assessment = {
  schema_version: "treaty6-procurement-beta-assessment-v1",
  generated_at: generatedAt,
  result: built.readiness,
  route: built.model.route,
  projection_checksum: built.public_projection_checksum,
  simulation_metrics: built.model.metrics,
  thin_sections: built.model.thin_sections,
  publication_decisions: built.decisions,
  source_registry_references: references,
  publication_policy: built.model.publication_policy,
  navigation_state: { section: "procurement", route: "/north/procurement", practical_opportunity_section: true, separate_from_accountability: true },
  validation: built.validation,
  private_business_profiles_included: false,
  public_projection_contains_personalized_matches: false,
  production_deployed: false,
  pushed: false,
  owner_approval_required: true,
}
assessment.assessment_checksum = hash(assessment)
atomic(path.join(outputDirectory, "beta-assessment-private.json"), assessment)
atomic(path.join(outputDirectory, "publication-policy-private.json"), { policy: built.model.publication_policy, decisions: built.decisions, validated_at: generatedAt })
atomic(path.join(outputDirectory, "page-simulation-private.json"), { model: built.model, simulation_only: true, deployed: false, generated_at: generatedAt })

const snapshotId = `treaty6-procurement-beta-v1-${hash(assessment).slice(0, 16)}`
const snapshotDirectory = path.join(outputDirectory, "recovery", snapshotId)
const recoveryFiles = {
  "beta-public-projection.json": built.model,
  "beta-assessment-private.json": assessment,
  "publication-policy-private.json": { policy: built.model.publication_policy, decisions: built.decisions, validated_at: generatedAt },
  "source-registry-references-private.json": references,
  "navigation-state-private.json": assessment.navigation_state,
  "validation-private.json": built.validation,
}
for (const [name, value] of Object.entries(recoveryFiles)) atomic(path.join(snapshotDirectory, "payload", name), value)
const manifest = {
  schema_version: "treaty6-procurement-beta-recovery-v1",
  snapshot_id: snapshotId,
  created_at: generatedAt,
  verified: true,
  credentials_included: false,
  private_business_profiles_included: false,
  files: Object.entries(recoveryFiles).map(([name, value]) => ({ name, sha256: hash(`${JSON.stringify(value, null, 2)}\n`) })),
}
atomic(path.join(snapshotDirectory, "manifest.json"), manifest)
const verified = manifest.files.every(item => hash(readFileSync(path.join(snapshotDirectory, "payload", item.name), "utf8")) === item.sha256)
atomic(path.join(outputDirectory, "recovery-reference-private.json"), { snapshot_id: snapshotId, path: path.relative(root, snapshotDirectory), verified, created_at: generatedAt })

const report = `# Treaty 6 Procurement Beta v1

- Route: ${built.model.route}
- Open bid-ready opportunities: ${built.model.metrics.open_bid_ready_count}
- Indigenous-specific opportunities/signals: ${built.model.metrics.indigenous_specific_count}
- Planning/watch signals: ${built.model.metrics.planning_watch_count}
- Supplier/prequalification paths: ${built.model.metrics.supplier_prequalification_count}
- Source families: ${built.model.metrics.source_family_count}
- Buyers: ${built.model.metrics.buyer_count}
- Categories: ${built.model.metrics.category_count}
- Thin sections: ${built.model.thin_sections.join(", ") || "none"}
- Validation: ${built.validation.valid ? "PASSED" : "FAILED"}
- Deployment: not performed

## Recommendation

${built.readiness}

The page is an owner-gated beta. It contains no personalized Treaty 6 business matches, no qualification claims and no procurement-equity or discrimination conclusions. Official sources control eligibility, deadlines and requirements.
`
atomic(path.join(outputDirectory, "TREATY6_PROCUREMENT_BETA_V1-private.md"), report)

process.stdout.write(`${JSON.stringify({ result: built.readiness, route: built.model.route, metrics: built.model.metrics, thin_sections: built.model.thin_sections, validation: built.validation, recovery: snapshotId, public_projection: path.relative(root, publicOutput), report: path.relative(root, path.join(outputDirectory, "TREATY6_PROCUREMENT_BETA_V1-private.md")) }, null, 2)}\n`)
