import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import registry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }
import resources from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { auditCanonicalResources } from "../server/farmDataQuality.js"
import { runLegalIndexListener } from "../server/farmLegalListeners.js"
import { farmListenerInventory, runFarmCycle } from "../server/farmJobScheduler.js"
import { createFarmOperationsStore } from "../server/farmOperationsStore.js"
import { runFarmSecuritySanity } from "../server/farmSecurityMaintenance.js"
import { buildFarmWeeklyOwnerEmail } from "../server/farmWeeklyOwnerEmail.js"
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

async function probeIgor() {
  const gateway = process.env.FARM_IGOR_HEALTH_URL
  if (!gateway) return { available: false, reason: "igor_health_endpoint_not_configured" }
  try {
    const response = await fetch(gateway, { signal: AbortSignal.timeout(2_000) })
    return response.ok ? { available: true } : { available: false, reason: `igor_health_${response.status}` }
  } catch { return { available: false, reason: "igor_unreachable" } }
}

async function resourceHealth(previous) {
  const selected = resources.records.slice(0, 16)
  const prior = new Map((previous?.documents || []).map(item => [item.canonical_resource_id, item]))
  const documents = []
  for (const record of selected) {
    const url = record.source?.url || record.website
    let status = "unavailable"
    let finalUrl = url
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Miller-Farm-ReadOnly/1.0" } })
      status = response.ok ? "resolves" : `http_${response.status}`
      finalUrl = response.url || url
    } catch { status = "transient_failure" }
    documents.push({ canonical_resource_id: record.canonical_resource_id, status, final_url: finalUrl })
  }
  const baseline = !previous?.documents?.length
  const changed = baseline ? [] : documents.filter(item => { const old = prior.get(item.canonical_resource_id); return old && (old.status !== item.status || old.final_url !== item.final_url) })
  return { checked: documents.length, updated_documents: changed.length, unchanged_documents: documents.length - changed.length, owner_review: changed.filter(item => !["resolves", "transient_failure"].includes(item.status)).length, output_titles: changed.map(item => item.canonical_resource_id), memory: { schema_version: "farm-resource-health-memory-v1", documents }, notes: [baseline ? "Initial resource-health baseline recorded." : "A single transient failure is retained as a recheck signal, not a closure finding."] }
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
  miller_data_quality: async () => { const report = auditCanonicalResources(resources.records); return { checked: report.checked, owner_review: report.owner_review.length, material_changes: report.defects.length + report.safe_correction_candidates.length, output_titles: [...new Set(report.defects.map(item => item.defect))], memory: { schema_version: "farm-data-quality-memory-v1", audit_fingerprint: JSON.stringify(report.defect_counts), defect_counts: report.defect_counts }, notes: [`${report.safe_correction_candidates.length} deterministic correction proposal(s); zero production mutations.`] } },
  farm_qwen_benchmark: async () => { const result = await child("scripts/benchmark-farm-qwen.mjs"); return { checked: result.total, owner_review: result.unsupported + result.malformed + result.incorrect, material_changes: result.regression ? 1 : 0, notes: [`${result.correct}/${result.total} correct; ${result.latency_ms} ms; advisory only.`], memory: result } },
  farm_security_sanity: async () => { const report = runFarmSecuritySanity({ root }); return { checked: report.checked, owner_review: report.findings.length, errors: report.findings.filter(item => ["critical", "high"].includes(item.severity)).length, output_titles: report.findings.map(item => item.code), notes: ["Secret values were not included in the result."] } },
  production_health: async () => productionHealth(),
  listener_memory_integrity: async () => listenerMemoryIntegrity(),
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
      await send({ recipient, subject: email.subject, text: email.text, html: email.html })
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
  const workerHealth = { igor: await probeIgor() }
  const cycle = await runFarmCycle({ registry, state, adapters, workerHealth, mode, only, maxJobs })
  store.saveState(cycle.state)
  store.appendRuns(cycle.runs)
  const allHistory = store.loadHistory()
  const inventory = farmListenerInventory({ registry, state: cycle.state, history: allHistory })
  store.saveInventory(inventory)
  store.saveCycle({ ...cycle, worker_health: workerHealth, production_writes: 0, publication_writes: 0 })
  console.log(JSON.stringify({ status: "completed", mode, selected_jobs: cycle.selected_jobs, runs: cycle.runs.map(run => ({ listener_id: run.listener_id, status: run.status, checked: run.checked, changed: run.new_documents + run.updated_documents + run.material_changes, owner_review: run.owner_review, errors: run.errors })), worker_health: workerHealth, enabled_jobs: inventory.filter(item => item.enabled).length, disabled_jobs: inventory.filter(item => !item.enabled).length, production_writes: 0, publication_writes: 0 }))
} finally {
  store.release()
}
