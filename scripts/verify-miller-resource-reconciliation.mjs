import reconciliation from "../src/data/miller-shared-resource-reconciliation-2026-09-08.json" with { type: "json" }

const records = [...reconciliation.records, ...reconciliation.funding_records]
const ids = records.map(record => record.canonical_resource_id)
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
const forbidden = /owner_review|accountability_watch|canonical_event_id|legal_record_id|private_research|investigation|court_finding/i

if (duplicates.length) throw new Error(`duplicate reconciliation IDs: ${[...new Set(duplicates)].join(", ")}`)
for (const record of records) {
  if (!record.canonical_resource_id) throw new Error("missing canonical_resource_id")
  if (!Array.isArray(record.project_visibility) || !record.project_visibility.length) throw new Error(`missing visibility: ${record.canonical_resource_id}`)
  if (!record.website?.startsWith("https://")) throw new Error(`non-HTTPS website: ${record.canonical_resource_id}`)
  if (!record.source?.url?.startsWith("https://")) throw new Error(`non-HTTPS source: ${record.canonical_resource_id}`)
  if (!record.last_verified_date) throw new Error(`missing verification date: ${record.canonical_resource_id}`)
  if (forbidden.test(JSON.stringify(record))) throw new Error(`private/evidence field in public reconciliation: ${record.canonical_resource_id}`)
}

const urls = [...new Set(records.flatMap(record => [record.website, record.source.url]))]
const results = []
let cursor = 0

await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < urls.length) {
    const url = urls[cursor++]
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "Miller canonical resource reconciliation verifier/1.0" },
        signal: AbortSignal.timeout(20_000),
      })
      const accessRestricted = [401, 403, 429].includes(response.status)
      results.push({ url, status: response.status, ok: response.ok || accessRestricted, access_restricted: accessRestricted, final_url: response.url })
    } catch (error) {
      results.push({ url, status: null, ok: false, error: String(error?.message || error) })
    }
  }
}))

results.sort((left, right) => left.url.localeCompare(right.url))
const failures = results.filter(result => !result.ok)
const restricted = results.filter(result => result.access_restricted)
console.log(JSON.stringify({
  records: records.length,
  unique_ids: new Set(ids).size,
  urls_checked: results.length,
  accessible: results.length - failures.length - restricted.length,
  access_restricted: restricted.length,
  failures,
  publication_boundary: reconciliation.publication_boundary,
  outcomes: reconciliation.reconciliation_outcomes,
}, null, 2))
if (failures.length) process.exitCode = 1
