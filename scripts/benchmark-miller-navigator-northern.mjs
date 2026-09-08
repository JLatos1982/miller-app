import { writeFile } from "node:fs/promises"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  buildMillerCanadianCommunityCoverageMatrix,
  MILLER_NATIONAL_QUERY_BENCHMARK,
  MILLER_NORTHERN_QUERY_BENCHMARK,
  runMillerMobileQueryBenchmark,
  runMillerNorthernPathwayBenchmark,
} from "../server/millerMobileBenchmark.js"
import { buildMillerMobileInventory } from "../server/millerMobileApi.js"

const now = () => new Date("2026-09-08T12:00:00.000Z")
const output = {
  schema_version: "miller-navigator-northern-remote-benchmark-v1",
  generated_at: now().toISOString(),
  inventory: buildMillerMobileInventory(millerMobileCatalog),
  national_regression: runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NATIONAL_QUERY_BENCHMARK }),
  northern_pathways: runMillerNorthernPathwayBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NORTHERN_QUERY_BENCHMARK }),
  community_coverage: buildMillerCanadianCommunityCoverageMatrix(millerMobileCatalog, { now: now() }),
}

await writeFile(new URL("../reports/miller-navigator-northern-remote-benchmark-2026-09-08.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  resources: output.inventory.total,
  mobile_ready: output.inventory.readiness.mobile_ready,
  readiness_rate: output.inventory.readiness.readiness_rate,
  national: `${output.national_regression.passing_queries}/${output.national_regression.query_count}`,
  northern: `${output.northern_pathways.passing_scenarios}/${output.northern_pathways.scenario_count}`,
  false_local_facility_claims: output.northern_pathways.false_local_facility_claims,
}))
