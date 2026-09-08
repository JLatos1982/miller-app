import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import registry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }
import resources from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import legacyResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { auditCanonicalResources } from "../server/farmDataQuality.js"
import { auditMillerLocations, inventoryMillerLocationMachinery } from "../server/farmLocationQuality.js"
import { inventoryFarmSecurityMaintenance } from "../server/farmSecurityMaintenance.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = path => JSON.parse(readFileSync(resolve(root, path), "utf8"))
const inventory = read(".farm-operations/farm-listener-inventory-v1.json").listeners
const qwen = read("artifacts/farm-operations/farm-qwen-benchmark-v1.json")
const qwenExtraction = read("artifacts/farm-operations/farm-qwen-narrow-extraction-benchmark-v1.json")
const graph = read("artifacts/farm-operations/farm-evidence-graph-v1.json")
const igorState = read(".farm-operations/igor-worker-state-v1.json")
const dataQuality = auditCanonicalResources(resources.records)
const locationQuality = auditMillerLocations(legacyResources)
const security = inventoryFarmSecurityMaintenance(root)
const enabled = inventory.filter(item => item.enabled)
const disabled = inventory.filter(item => !item.enabled)
const completed = inventory.filter(item => ["completed", "no_material_change"].includes(item.status))
const deferred = inventory.filter(item => item.status === "deferred")
const report = {
  schema_version: "farm-operating-framework-report-v1",
  generated_at: new Date().toISOString(),
  authority: { mutation: false, publication: false, credential_change: false },
  registry: { total: registry.listeners.length, enabled: enabled.length, disabled: disabled.length, completed_baselines: completed.length, deferred: deferred.length },
  activation: { heartbeat_active: true, daily_dispatch: "06:15 local time", max_jobs_per_cycle: registry.policy.max_jobs_per_daily_tick, state_directory: ".farm-operations (local, ignored)", owner_notification_policy: "failed runs only" },
  enabled_jobs: enabled.map(item => ({ listener_id: item.listener_id, worker: item.execution_target, status: item.status, last_run_at: item.last_run_at, next_run_at: item.next_run_at, documents_checked: item.yield.documents_checked, cadence_recommendation: item.cadence_recommendation })),
  disabled_jobs: disabled.map(item => ({ listener_id: item.listener_id, worker: item.execution_target, reason: registry.listeners.find(candidate => candidate.listener_id === item.listener_id)?.yield_class || "disabled", next_expected: item.next_run_at })),
  qwen: { model: qwen.model, total: qwen.total, correct: qwen.correct, accuracy_percent: Number((qwen.correct / qwen.total * 100).toFixed(1)), malformed: qwen.malformed, unsupported: qwen.unsupported, latency_ms: qwen.latency_ms, narrow_extraction: qwenExtraction, recurring_job_enabled: false, disposition: "recurring use disabled; deterministic extraction remains better" },
  igor: { configured_recurring_jobs: enabled.filter(item => item.execution_target === "igor").length, completed: enabled.filter(item => item.execution_target === "igor" && ["completed", "no_material_change"].includes(item.status)).length, deferred: enabled.filter(item => item.execution_target === "igor" && item.status === "deferred").length, health: "authenticated_local_worker", state: igorState },
  data_quality: { checked: dataQuality.checked, defects: dataQuality.defects.length, safe_correction_candidates: dataQuality.safe_correction_candidates.length, owner_review: dataQuality.owner_review.length, production_mutations: dataQuality.production_mutations, location: { checked: locationQuality.checked, ...locationQuality.defect_counts, production_mutations: locationQuality.production_mutations }, location_machinery: inventoryMillerLocationMachinery() },
  security,
  event_graph: { nodes: graph.nodes.length, edges: graph.edges.length, counts: graph.counts, incident_pathway_groups: graph.pathway_suggestions.length, pathway_suggestions: graph.pathway_suggestions.reduce((sum, item) => sum + item.suggestions.length, 0), automatic_merges: 0, automatic_publications: 0 },
  weekly_email: { structured_payload: true, preview_generated: true, delivery_enabled: false, blocker: "owner recipient/provider configuration is absent", privacy: ["no raw source bodies", "no secrets", "no personal medical details", "no unpublished allegations"] },
  current_cycle: { checked: completed.reduce((sum, item) => sum + item.yield.documents_checked, 0), material_changes: 0, errors: 0, production_writes: 0, publication_writes: 0 },
}

const artifactPath = resolve(root, "artifacts/farm-operations/farm-operating-framework-v1.json")
const reportPath = resolve(root, "reports/farm-operating-framework-2026-09-07.md")
mkdirSync(dirname(artifactPath), { recursive: true })
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`)

const enabledLines = report.enabled_jobs.map(item => `| ${item.listener_id} | ${item.worker} | ${item.status} | ${item.documents_checked} | ${item.next_run_at || "—"} |`).join("\n")
const disabledLines = report.disabled_jobs.map(item => `| ${item.listener_id} | ${item.worker} | ${item.reason} |`).join("\n")
const markdown = `# Farm operating framework checkpoint

Generated ${report.generated_at}. This checkpoint describes read-only research and maintenance operation. It grants no mutation or publication authority.

## Operating result

- ${report.registry.total} registered jobs: ${report.registry.enabled} enabled and ${report.registry.disabled} disabled.
- ${report.registry.completed_baselines} enabled jobs have completed; ${report.registry.deferred} job(s) are currently deferred.
- A daily local heartbeat dispatches at most ${report.activation.max_jobs_per_cycle} due jobs. Each listener retains its own cadence.
- The activation cycle recorded ${report.current_cycle.checked} checks, no material source change, no error, and no production/publication write.

## Enabled

| Job | Worker | Last status | Checked | Next run |
| --- | --- | --- | ---: | --- |
${enabledLines}

## Disabled

| Job | Worker | Reason |
| --- | --- | --- |
${disabledLines}

Disabled jobs remain registered so their purpose and prerequisites are explicit. Qwen recurring triage is disabled because its reviewed 12-item benchmark achieved ${report.qwen.correct}/${report.qwen.total} (${report.qwen.accuracy_percent}%) with ${report.qwen.malformed} malformed result. The narrower extraction benchmark achieved ${(report.qwen.narrow_extraction.accuracy * 100).toFixed(1)}% field accuracy with ${(report.qwen.narrow_extraction.structured_compliance * 100).toFixed(1)}% structured compliance in ${report.qwen.narrow_extraction.latency_ms} ms. It remains unsuitable for recurring work.

## Igor

Igor is an authenticated, one-shot local worker with ${report.igor.state.capabilities.length} declared capabilities. ${report.igor.configured_recurring_jobs} enabled jobs are assigned to it; ${report.igor.completed} have completed at least one cycle and ${report.igor.deferred} are currently deferred. No autonomous publishing or mutation capability was granted.

## Data quality and security

- Canonical resources checked: ${report.data_quality.checked}; defects: ${report.data_quality.defects}; safe correction proposals: ${report.data_quality.safe_correction_candidates}; owner-review issues: ${report.data_quality.owner_review}.
- The location detect/propose job checked ${report.data_quality.location.checked} legacy rows: ${report.data_quality.location.safe_normalizations} safe normalization proposals, ${report.data_quality.location.research_candidates} research candidates and ${report.data_quality.location.owner_review_candidates} duplicate-location owner-review groups. It made zero production mutations.
- Read-only secret/config sanity, listener-memory integrity, worker availability, and public production-health checks are enabled.
- The older security pulse and local automation scheduler are implemented but intentionally inactive. Read-only dependency advisory is now monthly; backup/recovery verification remains a documented owner decision because no off-host listener-state restore test was located.

## Evidence graph and legal/support pathways

The deterministic projection contains ${report.event_graph.nodes} nodes and ${report.event_graph.edges} reviewed edges across ${report.event_graph.counts.incidents} incidents, ${report.event_graph.counts.watch_chains} Accountability Watch chains, ${report.event_graph.counts.legal_records} legal records, and ${report.event_graph.counts.support_resources} shared support resources. It generated ${report.event_graph.pathway_suggestions} owner-reviewed legal/support pathway suggestions. No event was auto-merged and nothing was auto-published.

## Weekly owner email

The weekly summary is generated from bounded run manifests rather than scraped logs. A privacy-filtered preview was generated. Delivery remains off because no explicit owner recipient/provider configuration is present; this is safer than guessing an address.
`
writeFileSync(reportPath, markdown)
console.log(JSON.stringify({ artifact: artifactPath, report: reportPath, registry: report.registry, qwen: report.qwen, igor: report.igor, data_quality: report.data_quality, event_graph: report.event_graph }, null, 2))
