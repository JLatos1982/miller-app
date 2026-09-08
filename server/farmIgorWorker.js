import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const FARM_IGOR_PROTOCOL_VERSION = "farm-igor-local-worker-v1"
export const FARM_IGOR_WORKER_VERSION = "igor-farm-worker-v1.0.0"
export const FARM_IGOR_CAPABILITIES = Object.freeze([
  "resource_url_health",
  "structured_diff",
  "listener_batch_parse",
])

const MAX_BODY_BYTES = 128 * 1024
const DEFAULT_WORKER_SCRIPT = fileURLToPath(new URL("../scripts/farm-igor-worker.mjs", import.meta.url))
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max)
const sha256 = value => createHash("sha256").update(value).digest("hex")
const canonical = value => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value)
  if (Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  throw new Error("igor_protocol_noncanonical_value")
}
const safeEqual = (left, right) => typeof left === "string" && typeof right === "string" && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right))
const without = (value, field) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== field))
const sign = (value, secret) => createHmac("sha256", Buffer.from(secret, "base64")).update(canonical(value)).digest("hex")

function atomicJson(path, value) {
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
}

export function ensureFarmIgorCredential(root) {
  const directory = resolve(root, ".farm-operations")
  const path = resolve(directory, "igor-worker-credential-v1.json")
  mkdirSync(directory, { recursive: true })
  if (!existsSync(path)) atomicJson(path, { schema_version: "farm-igor-credential-v1", key_id: "samwise-local-v1", secret: randomBytes(32).toString("base64"), created_at: new Date().toISOString() })
  const credential = JSON.parse(readFileSync(path, "utf8"))
  if (credential.schema_version !== "farm-igor-credential-v1" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(credential.key_id) || Buffer.from(credential.secret || "", "base64").length < 32) throw new Error("igor_credential_invalid")
  return { ...credential, path }
}

export function createFarmIgorRequest({ credential, capability, payload = {}, now = new Date(), lifetimeMs = 60_000 } = {}) {
  if (!FARM_IGOR_CAPABILITIES.includes(capability) && capability !== "health") throw new Error("igor_capability_unsupported")
  const issued = new Date(now)
  const request = {
    protocol_version: FARM_IGOR_PROTOCOL_VERSION,
    schema_version: "farm-igor-request-v1",
    request_id: `igor_farm_${randomUUID()}`,
    key_id: credential.key_id,
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + Math.min(60_000, Math.max(1_000, lifetimeMs))).toISOString(),
    nonce: randomBytes(32).toString("hex"),
    capability,
    mutation_authority: false,
    publication_authority: false,
    payload,
  }
  const body = canonical(request)
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error("igor_request_too_large")
  return { ...request, signature: sign(request, credential.secret) }
}

export function verifyFarmIgorRequest(request, credential, { now = new Date() } = {}) {
  if (!request || request.schema_version !== "farm-igor-request-v1" || request.protocol_version !== FARM_IGOR_PROTOCOL_VERSION) throw new Error("igor_request_schema_invalid")
  if (request.key_id !== credential.key_id || !safeEqual(request.signature, sign(without(request, "signature"), credential.secret))) throw new Error("igor_authentication_failed")
  if (request.mutation_authority !== false || request.publication_authority !== false) throw new Error("igor_authority_invalid")
  if (!FARM_IGOR_CAPABILITIES.includes(request.capability) && request.capability !== "health") throw new Error("igor_capability_unsupported")
  const issued = new Date(request.issued_at).getTime(); const expires = new Date(request.expires_at).getTime(); const current = new Date(now).getTime()
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > 60_000 || current > expires || issued - current > 5_000) throw new Error("igor_request_expired")
  if (!/^igor_farm_[0-9a-f-]{36}$/.test(request.request_id) || !/^[a-f0-9]{64}$/.test(request.nonce)) throw new Error("igor_request_identity_invalid")
  return true
}

export function createFarmIgorResponse({ request, credential, status = "completed", result = {}, error = null, now = new Date() } = {}) {
  const response = {
    protocol_version: FARM_IGOR_PROTOCOL_VERSION,
    schema_version: "farm-igor-response-v1",
    request_id: request.request_id,
    capability: request.capability,
    completed_at: new Date(now).toISOString(),
    worker_version: FARM_IGOR_WORKER_VERSION,
    status,
    mutation_authority: false,
    publication_authority: false,
    result,
    error: error ? clean(error, 120) : null,
  }
  return { ...response, signature: sign(response, credential.secret) }
}

export function verifyFarmIgorResponse(response, request, credential) {
  if (!response || response.schema_version !== "farm-igor-response-v1" || response.protocol_version !== FARM_IGOR_PROTOCOL_VERSION) throw new Error("igor_response_schema_invalid")
  if (response.request_id !== request.request_id || response.capability !== request.capability) throw new Error("igor_response_binding_invalid")
  if (!safeEqual(response.signature, sign(without(response, "signature"), credential.secret))) throw new Error("igor_response_authentication_failed")
  if (response.mutation_authority !== false || response.publication_authority !== false) throw new Error("igor_response_authority_invalid")
  if (response.status !== "completed") throw new Error(response.error || "igor_worker_failed")
  validateFarmIgorCapabilityResult(request.capability, response.result)
  return response.result
}

export function validateFarmIgorCapabilityResult(capability, result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("igor_result_partial")
  if (capability === "health" && !(result.online === true && result.authenticated === true && Array.isArray(result.capabilities))) throw new Error("igor_result_partial")
  if (capability === "resource_url_health" && !(Number.isInteger(result.checked) && Array.isArray(result.documents))) throw new Error("igor_result_partial")
  if (capability === "structured_diff" && !(Number.isInteger(result.checked) && Number.isInteger(result.changed) && Array.isArray(result.records))) throw new Error("igor_result_partial")
  if (capability === "listener_batch_parse" && !(Number.isInteger(result.checked) && Number.isInteger(result.duplicates_suppressed) && Array.isArray(result.normalized) && Array.isArray(result.owner_review))) throw new Error("igor_result_partial")
  return true
}

const fieldValue = (record, paths) => {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], record)
    if (value !== undefined && value !== null && String(value).trim()) return typeof value === "object" ? canonical(value) : String(value).trim()
  }
  return ""
}

export function compareResourceSnapshots(before = [], after = []) {
  const fields = {
    url: ["website", "source.url"], phone: ["phone"], eligibility: ["eligibility", "population_served"],
    service_scope: ["service_area", "description", "categories"], funding_deadline: ["funding.deadline", "funding.status"],
  }
  const old = new Map(before.map(item => [item.canonical_resource_id, item]))
  const changes = []
  for (const record of after) {
    const prior = old.get(record.canonical_resource_id)
    if (!prior) { changes.push({ canonical_resource_id: record.canonical_resource_id, disposition: "new_record", changed_fields: [] }); continue }
    const changed = Object.entries(fields).filter(([, paths]) => fieldValue(prior, paths) !== fieldValue(record, paths)).map(([name]) => name)
    changes.push({ canonical_resource_id: record.canonical_resource_id, disposition: changed.length ? "changed" : "likely_unchanged", changed_fields: changed })
  }
  return { checked: after.length, changed: changes.filter(item => item.disposition !== "likely_unchanged").length, records: changes }
}

export function analyzeListenerBatch(items = []) {
  const normalized = []; const seenIds = new Set(); const seenFingerprints = new Map(); const duplicates = []
  for (const item of items.slice(0, 100)) {
    const id = clean(item.id || item.public_incident_id || item.source_id || item.url, 180)
    const title = clean(item.title || item.name || "Untitled", 240)
    const sourceUrl = clean(item.source_url || item.url || item.sources?.[0]?.url, 500)
    const fingerprint = sha256(canonical({ title: title.toLowerCase(), source_url: sourceUrl.replace(/[?#].*$/, ""), date: clean(item.date || item.event_date || item.publication_date, 32) }))
    if (!id || seenIds.has(id) || seenFingerprints.has(fingerprint)) { duplicates.push({ id: id || "missing_id", same_as: seenFingerprints.get(fingerprint) || id, reason: seenIds.has(id) ? "duplicate_id" : "duplicate_fingerprint" }); continue }
    seenIds.add(id); seenFingerprints.set(fingerprint, id)
    normalized.push({ id, title, source_url: sourceUrl, province: clean(item.province, 80), date: clean(item.date || item.event_date || item.publication_date, 32), document_fingerprint: fingerprint })
  }
  return { checked: Math.min(items.length, 100), valid: normalized.length, duplicates_suppressed: duplicates.length, normalized, duplicates, owner_review: normalized.filter(item => !item.source_url).map(item => item.id) }
}

async function resourceUrlHealth(records, previous = {}) {
  const prior = new Map((previous.documents || []).map(item => [item.canonical_resource_id, item]))
  const documents = []
  for (const record of records.slice(0, 20)) {
    const url = record.url || record.website || record.source?.url
    let status = "transient_failure"; let final_url = url; let http_status = null
    try {
      let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Miller-Farm-Igor-ReadOnly/1.0" } })
      if ([403, 405].includes(response.status)) response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Miller-Farm-Igor-ReadOnly/1.0", Range: "bytes=0-2047" } })
      http_status = response.status; final_url = response.url || url; status = response.ok ? (final_url !== url ? "redirect" : "resolves") : response.status >= 500 || response.status === 429 ? "temporary_failure" : `http_${response.status}`
    } catch { status = "transient_failure" }
    const old = prior.get(record.canonical_resource_id)
    const failure_streak = /failure|http_[45]/.test(status) ? Number(old?.failure_streak || 0) + 1 : 0
    documents.push({ canonical_resource_id: record.canonical_resource_id, status, final_url, http_status, failure_streak, potential_closure_candidate: failure_streak >= 3 && /^http_4/.test(status) })
  }
  const baseline = !previous.documents?.length
  const changed = baseline ? [] : documents.filter(item => { const old = prior.get(item.canonical_resource_id); return old && (old.status !== item.status || old.final_url !== item.final_url) })
  return { checked: documents.length, successful: documents.filter(item => ["resolves", "redirect"].includes(item.status)).length, redirects: documents.filter(item => item.status === "redirect").length, temporary_failures: documents.filter(item => /temporary|transient/.test(item.status)).length, repeated_failures: documents.filter(item => item.failure_streak >= 2).length, closure_candidates: documents.filter(item => item.potential_closure_candidate).length, updated_documents: changed.length, unchanged_documents: documents.length - changed.length, baseline, documents }
}

export async function executeFarmIgorCapability(capability, payload = {}) {
  if (capability === "health") return { online: true, authenticated: true, worker_version: FARM_IGOR_WORKER_VERSION, capabilities: FARM_IGOR_CAPABILITIES, status: "idle", last_successful_job: payload.last_successful_job || null, last_heartbeat: new Date().toISOString() }
  if (capability === "resource_url_health") return resourceUrlHealth(payload.records || [], payload.previous || {})
  if (capability === "structured_diff") return compareResourceSnapshots(payload.before || [], payload.after || [])
  if (capability === "listener_batch_parse") return analyzeListenerBatch(payload.items || [])
  throw new Error("igor_capability_unsupported")
}

export async function handleFarmIgorEnvelope({ request, credential, root, now = new Date() } = {}) {
  verifyFarmIgorRequest(request, credential, { now })
  const replayPath = resolve(root, ".farm-operations", "igor-worker-replay-v1.json")
  const statePath = resolve(root, ".farm-operations", "igor-worker-state-v1.json")
  const replay = existsSync(replayPath) ? JSON.parse(readFileSync(replayPath, "utf8")) : { schema_version: "farm-igor-replay-v1", requests: [] }
  if (replay.requests.some(item => item.request_id === request.request_id || item.nonce === request.nonce)) throw new Error("igor_replay_rejected")
  const priorState = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {}
  const result = await executeFarmIgorCapability(request.capability, request.capability === "health" ? { ...request.payload, last_successful_job: priorState.last_successful_job || null } : request.payload)
  replay.requests = [...replay.requests.slice(-199), { request_id: request.request_id, nonce: request.nonce, completed_at: new Date().toISOString() }]
  atomicJson(replayPath, replay)
  atomicJson(statePath, { schema_version: "farm-igor-worker-state-v1", worker_version: FARM_IGOR_WORKER_VERSION, capabilities: FARM_IGOR_CAPABILITIES, last_heartbeat: new Date().toISOString(), last_successful_job: request.capability === "health" ? priorState.last_successful_job || null : request.capability, status: "idle" })
  return createFarmIgorResponse({ request, credential, result, now })
}

export async function dispatchFarmIgorJob({ root, capability, payload = {}, timeoutMs = 45_000, workerScript = DEFAULT_WORKER_SCRIPT } = {}) {
  const credential = ensureFarmIgorCredential(root)
  const request = createFarmIgorRequest({ credential, capability, payload })
  const response = await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [workerScript], { cwd: root, env: { ...process.env, FARM_IGOR_CREDENTIAL_PATH: credential.path, FARM_IGOR_ROOT: root }, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""; let stderr = ""; let settled = false
    const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); fn(value) }
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(reject, new Error("igor_worker_timeout")) }, Math.max(100, timeoutMs))
    child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > MAX_BODY_BYTES * 2) child.kill("SIGTERM") })
    child.stderr.on("data", chunk => { stderr += chunk })
    child.on("error", error => finish(reject, error))
    child.on("close", code => {
      if (code !== 0) return finish(reject, new Error(clean(stderr || `igor_worker_exit_${code}`, 160)))
      try { finish(resolvePromise, JSON.parse(stdout)) } catch { finish(reject, new Error("igor_worker_malformed_response")) }
    })
    child.stdin.end(`${JSON.stringify(request)}\n`)
  })
  return verifyFarmIgorResponse(response, request, credential)
}

export async function probeFarmIgor(root) {
  try {
    const result = await dispatchFarmIgorJob({ root, capability: "health", timeoutMs: 5_000 })
    return { available: result.online === true && result.authenticated === true, authenticated: result.authenticated === true, ...result }
  } catch (error) { return { available: false, authenticated: false, reason: clean(error?.message || error, 120) } }
}
