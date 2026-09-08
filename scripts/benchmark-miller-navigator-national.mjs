import { writeFile } from "node:fs/promises"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  buildMillerCanadianCommunityCoverageMatrix,
  buildMillerMobileCoverageMatrix,
  MILLER_NATIONAL_QUERY_BENCHMARK,
  runMillerMobileQueryBenchmark,
} from "../server/millerMobileBenchmark.js"
import { buildMillerMobileInventory } from "../server/millerMobileApi.js"

const now = () => new Date("2026-09-08T12:00:00.000Z")
const output = {
  schema_version: "miller-navigator-national-benchmark-v1",
  generated_at: now().toISOString(),
  inventory: buildMillerMobileInventory(millerMobileCatalog),
  query_benchmark: runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NATIONAL_QUERY_BENCHMARK }),
  coverage: buildMillerMobileCoverageMatrix(millerMobileCatalog, { now: now() }),
  community_coverage: buildMillerCanadianCommunityCoverageMatrix(millerMobileCatalog, { now: now() }),
}

await writeFile(new URL("../reports/miller-navigator-national-benchmark-2026-09-08.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  resources: output.inventory.total,
  mobile_ready: output.inventory.readiness.mobile_ready,
  readiness_rate: output.inventory.readiness.readiness_rate,
  queries: output.query_benchmark.query_count,
  passing: output.query_benchmark.passing_queries,
  incorrect_local_facility_claims: output.query_benchmark.rows.reduce((sum, row) => sum + row.incorrect_local_facility_claims, 0),
}))
