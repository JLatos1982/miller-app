import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import registry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }
import resources from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import incidents from "../src/data/miller-north-serious-harm-public-v1.json" with { type: "json" }
import legacyResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { auditCanonicalResources } from "../server/farmDataQuality.js"
import { dispatchFarmIgorJob, probeFarmIgor } from "../server/farmIgorWorker.js"
import { runLegalIndexListener } from "../server/farmLegalListeners.js"
import { auditMillerLocations } from "../server/farmLocationQuality.js"
import { runExactDocumentListener, runFnhoPublicationsListener, runSaskatchewanHumanRightsListener, saskatchewanMilestoneRecords } from "../server/farmSourceListeners.js"
import { farmListenerInventory, runFarmCycle } from "../server/farmJobScheduler.js"
import { createFarmOperationsStore } from "../server/farmOperationsStore.js"
import { runFarmSecuritySanity } from "../server/farmSecurityMaintenance.js"
import { buildFarmReviewItemsFromRuns, buildFarmStatusSnapshot, createFarmSupabasePublisher } from "../server/farmSupabaseInteraction.js"
import { buildFarmWeeklyOwnerEmail, deliverFarmWeeklyOwnerEmail } from "../server/farmWeeklyOwnerEmail.js"
import { createEmailSender } from "../server/millerEmailResults.js"

const runFile = promisify(execFile)
const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const args = process.argv.slice(2)
const after = flag => { const index = args.indexOf(flag); return index === -1 ? null : args[index + 1] }
const only = after("--run")
const mode = args.includes("--execute") ? "execute" : "dry_run"
const maxJobs = Math.min(6, Math.max(1, Number(after("--max-jobs")) || 3))
const store = createFarmOperationsStore(root)

const parseChildJson = output => {
  const value = String(output || "").trim()
  if (!value) throw new Error("farm_child_empty_output")
  try { return JSON.parse(value) } catch { throw new Error("farm_child_invalid_json") }
}

async function child(script, scriptArgs = []) {
  const result = await runFile(process.execPath, [resolve(root, script), ...scriptArgs], { cwd: root, timeout: 300_000, maxBuffer: 2_000_000, env: { ...process.env, NODE_ENV: "development" } })
  return parseChildJson(result.stdout)
}

const commonFromMetrics = metrics => ({
  checked: metrics.checked ?? metrics.fetched ?? metrics.responder_rows ?? metrics.rows_checked ?? metrics.rows ?? 0,
  new_documents: metrics.new_documents ?? metrics.added_rows ?? metrics.new_rows ?? 0,
  updated_documents: metrics.updated_documents ?? metrics.amended_documents ?? metrics.changed_rows ?? 0,
  unchanged_documents: metrics.unchanged_documents ?? metrics.unchanged_rows ?? 0,
  owner_review: metrics.candidate_notices ?? metrics.owner_review ?? 0,
  errors: metrics.failed ?? metrics.errors ?? 0,
  material_changes: metrics.changed_rows ?? 0,
})

const compactResource = record => ({ canonical_resource_id: record.canonical_resource_id, website: record.website, source: { url: record.source?.url || "" }, phone: record.phone, eligibility: record.eligibility, population_served: record.population_served, service_area: record.service_area, description: record.description, categories: record.categories, funding: record.funding ? { deadline: record.funding.deadline || "", status: record.funding.status || "" } : null })

async function resourceHealth(previous) {
  const result = await dispatchFarmIgorJob({ root, capability: "resource_url_health", payload: { records: resources.records.slice(0, 16).map(compactResource), previous: previous || {} }, timeoutMs: 180_000 })
  return { checked: result.checked, updated_documents: result.updated_documents, unchanged_documents: result.unchanged_documents, owner_review: result.closure_candidates, output_titles: result.documents.filter(item => item.potential_closure_candidate).map(item => item.canonical_resource_id), memory: { schema_version: "farm-resource-health-memory-v1", documents: result.documents }, notes: [result.baseline ? "Igor recorded the initial URL-health baseline." : `${result.successful} URLs resolved; single transient failures remain recheck signals, not closure findings.`] }
}

async function resourceSnapshotComparison(previous) {
  const current = resources.records.slice(0, 40).map(compactResource)
  const before = previous?.snapshot || current
  const result = await dispatchFarmIgorJob({ root, capability: "structured_diff", payload: { before, after: current }, timeoutMs: 30_000 })
  const changes = result.records.filter(item => item.disposition !== "likely_unchanged")
  return { checked: result.checked, updated_documents: result.changed, unchanged_documents: result.checked - result.changed, owner_review: changes.length, output_titles: changes.map(item => `${item.canonical_resource_id}: ${item.changed_fields.join(", ") || item.disposition}`), memory: { schema_version: "farm-resource-snapshot-memory-v1", snapshot: current }, notes: ["Igor compared bounded structured fields only; semantic conclusions remain advisory and owner gated."] }
}

async function listenerBatchAnalysis(previous) {
  const items = incidents.incidents.slice(0, 20).map(item => ({ id: item.public_incident_id, title: item.title, province: item.province, event_date: item.event_date, sources: item.sources }))
  const result = await dispatchFarmIgorJob({ root, capability: "listener_batch_parse", payload: { items }, timeoutMs: 30_000 })
  return { checked: result.checked, duplicates_suppressed: result.duplicates_suppressed, owner_review: result.owner_review.length, unchanged_documents: result.valid, output_titles: result.owner_review, memory: { schema_version: "farm-listener-batch-memory-v1", document_fingerprints: result.normalized.map(item => ({ id: item.id, document_fingerprint: item.document_fingerprint })) }, notes: ["Igor validated and normalized a bounded public batch; final reconciliation and publication remained with Samwise/owner review."] }
}

async function dependencyAdvisory() {
  try {
    const { stdout } = await runFile("npm", ["audit", "--json", "--omit=dev"], { cwd: root, timeout: 120_000, maxBuffer: 4_000_000 })
    const audit = JSON.parse(stdout); const vulnerabilities = audit.metadata?.vulnerabilities || {}
    const count = Number(vulnerabilities.total ?? ["info", "low", "moderate", "high", "critical"].reduce((sum, key) => sum + Number(vulnerabilities[key] || 0), 0))
    return { checked: Number(audit.metadata?.dependencies?.prod || 0), owner_review: count, errors: Number(vulnerabilities.critical || 0) + Number(vulnerabilities.high || 0), output_titles: Object.entries(vulnerabilities).filter(([key, value]) => key !== "total" && value).map(([key, value]) => `${key}:${value}`), notes: ["Read-only npm advisory check; no dependency was upgraded or changed."], memory: { schema_version: "farm-dependency-advisory-memory-v1", vulnerabilities } }
  } catch (error) {
    const stdout = error?.stdout
    if (stdout) {
      const audit = JSON.parse(stdout); const vulnerabilities = audit.metadata?.vulnerabilities || {}; const count = Number(vulnerabilities.total ?? ["info", "low", "moderate", "high", "critical"].reduce((sum, key) => sum + Number(vulnerabilities[key] || 0), 0))
      return { checked: Number(audit.metadata?.dependencies?.prod || 0), owner_review: count, errors: Number(vulnerabilities.critical || 0) + Number(vulnerabilities.high || 0), output_titles: Object.entries(vulnerabilities).filter(([key, value]) => key !== "total" && value).map(([key, value]) => `${key}:${value}`), notes: ["npm audit returned advisories; no dependency was upgraded or changed."], memory: { schema_version: "farm-dependency-advisory-memory-v1", vulnerabilities } }
    }
    throw error
  }
}

async function productionHealth() {
  const url = "https://miller-app.onrender.com/indigenous-healthcare-evidence"
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Miller-Farm-ReadOnly/1.0" } })
    const contentSecurityPolicy = response.headers.get("content-security-policy")
    const contentType = response.headers.get("content-type") || ""
    const findings = []
    if (!response.ok) findings.push(`public_route_http_${response.status}`)
    if (!contentType.includes("text/html")) findings.push("unexpected_public_content_type")
    if (!contentSecurityPolicy) findings.push("content_security_policy_missing")
    return {
      checked: 3,
      errors: response.ok ? 0 : 1,
      owner_review: findings.length,
      output_titles: findings,
      notes: ["GET-only production check; response body and header values are not stored."],
      memory: { schema_version: "farm-production-health-memory-v1", checked_url: url, http_ok: response.ok, html: contentType.includes("text/html"), csp_present: Boolean(contentSecurityPolicy) },
    }
  } catch {
    return { checked: 1, errors: 1, owner_review: 1, output_titles: ["production_health_unreachable"], notes: ["The prior production state was retained; no deployment or repair was attempted."] }
  }
}

function listenerMemoryIntegrity() {
  const directories = [resolve(root, "artifacts/miller-north"), resolve(root, "artifacts/miller-legal"), resolve(root, "artifacts/farm-operations")]
  let checked = 0
  const failures = []
  for (const directory of directories) {
    if (!existsSync(directory)) continue
    for (const name of readdirSync(directory).filter(name => /memory.*\.json$/i.test(name))) {
      checked += 1
      try { JSON.parse(readFileSync(resolve(directory, name), "utf8")) } catch { failures.push(name) }
    }
  }
  return { checked, errors: failures.length, owner_review: failures.length, output_titles: failures, notes: failures.length ? ["Malformed listener memory was reported and not replaced."] : ["Registered listener memories parsed successfully."] }
}

const history = () => store.loadHistory()
const adapters = {
  alberta_fatality_responses: async () => { const metrics = await child("scripts/run-miller-north-alberta-fatality-response-listener.mjs"); return { ...commonFromMetrics(metrics), owner_review: Number(metrics.added_rows || 0) + Number(metrics.changed_rows || 0) } },
  bc_inquests: async () => commonFromMetrics(await child("scripts/run-miller-north-bc-inquest-listener.mjs", ["--since-year", "2024", "--limit", "100"])),
  bccnm_notices: async () => commonFromMetrics(await child("scripts/run-miller-north-bccnm-listener.mjs", ["--min-id", "1000", "--limit", "150"])),
  cpsbc_case_summaries: async () => { const metrics = await child("scripts/run-miller-north-cpsbc-case-study-listener.mjs"); return { ...commonFromMetrics(metrics), owner_review: Number(metrics.new_documents || 0) + Number(metrics.amended_documents || 0) } },
  alberta_ocya: async () => { const metrics = await child("scripts/run-miller-north-alberta-ocya-listener.mjs"); return { ...commonFromMetrics(metrics), owner_review: Number(metrics.new_rows || 0) + Number(metrics.changed_rows || 0) } },
  bchrt_recent: ({ previous }) => runLegalIndexListener({ listenerId: "legal_bchrt_recent_biweekly", url: "https://www.bchrt.bc.ca/law-library/decisions/recent/", previous, include: /decision|canlii|bchrt/i }),
  bchrt_judicial_reviews: ({ previous }) => runLegalIndexListener({ listenerId: "legal_bchrt_judicial_review_biweekly", url: "https://www.bchrt.bc.ca/law-library/judicial-reviews-of-decisions/", previous, include: /judicial|review|court|canlii/i, titlePattern: /\b(?:19|20)\d{2}\s+(?:BCHRT|BCSC|BCCA|SCC)\s+\d+\b/i }),
  alberta_human_rights: ({ previous }) => runLegalIndexListener({ listenerId: "legal_ab_human_rights_monthly", url: "https://www.albertahumanrights.ab.ca/what-are-human-rights/about-the-commission/human-rights-decisions/", previous, include: /decision|canlii|human rights/i }),
  shared_resource_health: ({ previous }) => resourceHealth(previous),
  shared_resource_snapshot: ({ previous }) => resourceSnapshotComparison(previous),
  igor_listener_batch: ({ previous }) => listenerBatchAnalysis(previous),
  miller_data_quality: async () => { const report = auditCanonicalResources(resources.records); return { checked: report.checked, owner_review: report.owner_review.length, material_changes: report.defects.length + report.safe_correction_candidates.length, output_titles: [...new Set(report.defects.map(item => item.defect))], memory: { schema_version: "farm-data-quality-memory-v1", audit_fingerprint: JSON.stringify(report.defect_counts), defect_counts: report.defect_counts }, notes: [`${report.safe_correction_candidates.length} deterministic correction proposal(s); zero production mutations.`] } },
  miller_location_quality: async () => { const report = auditMillerLocations(legacyResources); return { checked: report.checked, owner_review: report.owner_review.length, material_changes: report.safe_correction_candidates.length, output_titles: Object.entries(report.defect_counts).map(([key, value]) => `${key}:${value}`), memory: { schema_version: "farm-location-quality-memory-v1", defect_counts: report.defect_counts }, notes: [`${report.research_candidates.length} research candidate(s); static detect/propose only. Geocoding and public map decisions remain owner gated.`] } },
  farm_qwen_benchmark: async () => { const result = await child("scripts/benchmark-farm-qwen.mjs"); return { checked: result.total, owner_review: result.unsupported + result.malformed + result.incorrect, material_changes: result.regression ? 1 : 0, notes: [`${result.correct}/${result.total} correct; ${result.latency_ms} ms; advisory only.`], memory: result } },
  farm_security_sanity: async () => { const report = runFarmSecuritySanity({ root }); return { checked: report.checked, owner_review: report.findings.length, errors: report.findings.filter(item => ["critical", "high"].includes(item.severity)).length, output_titles: report.findings.map(item => item.code), notes: ["Secret values were not included in the result."] } },
  production_health: async () => productionHealth(),
  listener_memory_integrity: async () => listenerMemoryIntegrity(),
  dependency_advisory: async () => dependencyAdvisory(),
  fnho_publications: ({ previous }) => runFnhoPublicationsListener({ previous }),
  saskatchewan_exact_documents: ({ previous }) => runExactDocumentListener({ records: saskatchewanMilestoneRecords(), previous }),
  saskatchewan_human_rights: ({ previous }) => runSaskatchewanHumanRightsListener({ previous }),
  weekly_owner_summary: async () => {
    const email = buildFarmWeeklyOwnerEmail({ runs: history() })
    const path = resolve(store.paths.directory, "farm-weekly-owner-email-preview-v1.json")
    writeFileSync(path, `${JSON.stringify(email, null, 2)}\n`, { mode: 0o600 })
    const deliveryEnabled = process.env.FARM_OWNER_EMAIL_DELIVERY_ENABLED === "true"
    const recipient = String(process.env.MILLER_OWNER_EMAIL || "").trim()
    let delivery = "preview_only"
    if (deliveryEnabled) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("farm_owner_email_recipient_missing")
      const send = createEmailSender(process.env, fetch)
      if (!send) throw new Error("farm_owner_email_provider_unavailable")
      await deliverFarmWeeklyOwnerEmail({ email, recipient, send })
      delivery = "sent"
    }
    return { checked: email.sections.listeners.run_count, material_changes: email.nothing_material_changed ? 0 : 1, owner_review: email.sections.owner_attention.count, notes: [delivery === "sent" ? "Privacy-filtered weekly owner email sent." : "Weekly payload generated in preview-only mode; delivery is disabled until recipient and provider configuration are explicitly present."], memory: { generated_at: email.generated_at, delivery } }
  },
}

const lock = store.acquire()
if (!lock.acquired) {
  console.log(JSON.stringify({ status: "already_running", production_writes: 0, publication_writes: 0 }))
  process.exit(0)
}

try {
  const state = store.loadState()
  const workerHealth = { igor: await probeFarmIgor(root) }
  const privatePublisher = createFarmSupabasePublisher({
    url: process.env.FARM_PRIVATE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceRoleKey: process.env.FARM_PRIVATE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    ownerId: process.env.FARM_PRIVATE_OWNER_ID || process.env.SAMWISE_OWNER_STATUS_OWNER_ID,
    enabled: mode === "execute" && (process.env.FARM_PRIVATE_STATUS_PUBLISH_ENABLED === "true" || process.env.SAMWISE_OWNER_STATUS_PUBLISH_ENABLED === "true"),
  })
  let mailboxRequest = null
  let mailboxTarget = null
  if (!only && privatePublisher.configured) {
    mailboxRequest = await privatePublisher.fetchRunnableRequest()
    if (mailboxRequest) {
      const requestedTarget = mailboxRequest.request_type === "generate_owner_report" ? "farm_weekly_owner_summary" : mailboxRequest.target_id
      const registered = registry.listeners.find(item => item.listener_id === requestedTarget)
      if (registered?.enabled && registered.mutation_authority === false && registered.publication_authority === false) mailboxTarget = requestedTarget
      else await privatePublisher.completeRequest(mailboxRequest.id, { state: "rejected", resultCode: "invalid_target" })
    }
  }
  const cycle = await runFarmCycle({ registry, state, adapters, workerHealth, mode, only: only || mailboxTarget, maxJobs: mailboxTarget ? 1 : maxJobs })
  store.saveState(cycle.state)
  store.appendRuns(cycle.runs)
  const allHistory = store.loadHistory()
  const inventory = farmListenerInventory({ registry, state: cycle.state, history: allHistory })
  store.saveInventory(inventory)
  let privateSync = { status: "disabled", review_items: 0 }
  if (privatePublisher.configured) {
    const snapshot = buildFarmStatusSnapshot({ inventory, history: allHistory, workerHealth })
    const reviewItems = buildFarmReviewItemsFromRuns(cycle.runs, snapshot.generated_at)
    const [statusResult, reviewResult] = await Promise.all([privatePublisher.publishStatus(snapshot), privatePublisher.publishReviewItems(reviewItems)])
    privateSync = { status: statusResult.status, review_status: reviewResult.status, review_items: reviewResult.count }
  }
  if (mailboxRequest && mailboxTarget) {
    const run = cycle.runs.find(item => item.listener_id === mailboxTarget)
    const completed = run?.status === "completed"
    await privatePublisher.completeRequest(mailboxRequest.id, {
      state: completed ? "completed" : "deferred",
      resultCode: completed ? (Number(run.owner_review || 0) > 0 || Number(run.new_documents || 0) + Number(run.updated_documents || 0) + Number(run.material_changes || 0) > 0 ? "completed_with_review" : "completed_no_change") : "accepted",
      resultReference: run?.run_id || mailboxTarget,
    })
    privateSync.mailbox_request = { id: mailboxRequest.id, request_type: mailboxRequest.request_type, target_id: mailboxTarget, state: completed ? "completed" : "deferred" }
  }
  store.saveCycle({ ...cycle, worker_health: workerHealth, private_sync: privateSync, production_writes: 0, publication_writes: 0 })
  console.log(JSON.stringify({ status: "completed", mode, selected_jobs: cycle.selected_jobs, runs: cycle.runs.map(run => ({ listener_id: run.listener_id, status: run.status, checked: run.checked, changed: run.new_documents + run.updated_documents + run.material_changes, owner_review: run.owner_review, errors: run.errors })), worker_health: workerHealth, private_sync: privateSync, enabled_jobs: inventory.filter(item => item.enabled).length, disabled_jobs: inventory.filter(item => !item.enabled).length, production_writes: 0, publication_writes: 0 }))
} finally {
  store.release()
}
