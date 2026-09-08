import expansion from "../src/data/miller-western-mobile-expansion-2026-09-08.json" with { type: "json" }

const highUseVerifiedUrls = [
  "https://www.fraserhealth.ca/Service-Directory/Service-At-Location/4/1/creekside-withdrawal-management-detox-service---creekside-withdrawal-management-centre",
  "https://www.vch.ca/en/service/access-central-detox-referral-line",
  "https://www.vch.ca/en/location/vancouver-detoxification-centre",
  "https://www.raincityhousing.org/programs/housing-first-act-team/",
]
const urls = [...new Set([
  ...expansion.records.flatMap(record => [record.website, record.source?.url]).filter(Boolean),
  ...highUseVerifiedUrls,
])]
const results = []
let cursor = 0

await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < urls.length) {
    const url = urls[cursor++]
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "Miller Western Canada mobile resource verifier/1.0" },
        signal: AbortSignal.timeout(20_000),
      })
      results.push({
        url,
        status: response.status,
        ok: response.ok || response.status === 403,
        access_restricted: response.status === 403,
        final_url: response.url,
      })
    } catch (error) {
      results.push({ url, status: null, ok: false, error: String(error?.message || error) })
    }
  }
}))

results.sort((left, right) => left.url.localeCompare(right.url))
const failures = results.filter(result => !result.ok)
const restricted = results.filter(result => result.access_restricted)
console.log(JSON.stringify({
  checked: results.length,
  verified_accessible: results.length - failures.length - restricted.length,
  access_restricted: restricted.length,
  access_restricted_urls: restricted.map(result => result.url),
  failed: failures.length,
  failures,
}, null, 2))
if (failures.length) process.exitCode = 1
