import resources from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import incidents from "../src/data/miller-north-serious-harm-public-v1.json" with { type: "json" }
import { analyzeListenerBatch, compareResourceSnapshots, dispatchFarmIgorJob, probeFarmIgor } from "../server/farmIgorWorker.js"

const root = new URL("..", import.meta.url).pathname
const compact = record => ({ canonical_resource_id: record.canonical_resource_id, website: record.website, source: { url: record.source?.url || "" }, phone: record.phone, eligibility: record.eligibility, service_area: record.service_area, funding: record.funding ? { deadline: record.funding.deadline || "", status: record.funding.status || "" } : null })
const snapshot = resources.records.slice(0, 12).map(compact)
const changedSnapshot = snapshot.map((item, index) => index === 0 ? { ...item, phone: `${item.phone || ""} test-change` } : item)
const batch = incidents.incidents.slice(0, 10).map(item => ({ id: item.public_incident_id, title: item.title, province: item.province, event_date: item.event_date, sources: item.sources }))

const workerDiff = await dispatchFarmIgorJob({ root, capability: "structured_diff", payload: { before: snapshot, after: changedSnapshot } })
const localDiff = compareResourceSnapshots(snapshot, changedSnapshot)
const workerBatch = await dispatchFarmIgorJob({ root, capability: "listener_batch_parse", payload: { items: batch } })
const localBatch = analyzeListenerBatch(batch)
const urlRecords = snapshot.slice(0, 3)
const workerUrls = await dispatchFarmIgorJob({ root, capability: "resource_url_health", payload: { records: urlRecords, previous: {} }, timeoutMs: 60_000 })
const direct = []
for (const item of urlRecords) {
  const url = item.source.url || item.website
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Miller-Farm-Samwise-ReadOnly/1.0" } })
    if ([403, 405].includes(response.status)) response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Miller-Farm-Samwise-ReadOnly/1.0", Range: "bytes=0-2047" } })
    direct.push({ canonical_resource_id: item.canonical_resource_id, ok: response.ok, status: response.status })
  } catch { direct.push({ canonical_resource_id: item.canonical_resource_id, ok: false, status: null }) }
}
const urlAgreement = workerUrls.documents.filter(worker => { const samwise = direct.find(item => item.canonical_resource_id === worker.canonical_resource_id); return samwise && (["resolves", "redirect"].includes(worker.status) ? samwise.ok : !samwise.ok) }).length
const health = await probeFarmIgor(root)
const result = {
  schema_version: "farm-igor-workload-verification-v1",
  worker: { available: health.available, authenticated: health.authenticated, version: health.worker_version, capabilities: health.capabilities },
  structured_diff: { checked: workerDiff.checked, worker_changed: workerDiff.changed, local_changed: localDiff.changed, match: JSON.stringify(workerDiff.records) === JSON.stringify(localDiff.records) },
  listener_batch: { checked: workerBatch.checked, worker_duplicates: workerBatch.duplicates_suppressed, local_duplicates: localBatch.duplicates_suppressed, fingerprint_match: JSON.stringify(workerBatch.normalized) === JSON.stringify(localBatch.normalized) },
  url_health: { checked: workerUrls.checked, direct_checked: direct.length, coarse_status_agreement: urlAgreement, direct },
  mutation_authority: false,
  publication_authority: false,
}
console.log(JSON.stringify(result, null, 2))
