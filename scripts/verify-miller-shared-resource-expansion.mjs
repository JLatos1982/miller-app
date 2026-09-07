import expansion from "../src/data/miller-shared-resource-expansion-2026-09-07.json" with { type: "json" }

const urls = [...new Set(expansion.records.flatMap(record => [record.website, record.source?.url]).filter(Boolean))]
const results = []
let cursor = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < urls.length) {
    const url = urls[cursor++]
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "Miller resource link verifier/1.0" },
        signal: AbortSignal.timeout(20_000),
      })
      results.push({ url, status: response.status, ok: response.ok })
    } catch (error) {
      results.push({ url, status: null, ok: false, error: String(error?.message || error) })
    }
  }
}))
results.sort((a, b) => a.url.localeCompare(b.url))
const failures = results.filter(result => !result.ok)
console.log(JSON.stringify({ checked: results.length, passed: results.length - failures.length, failed: failures.length, failures }, null, 2))
if (failures.length) process.exitCode = 1
