import { writeFile } from "node:fs/promises"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  MILLER_HOME_COMMUNITY_HANDOFF_BENCHMARK,
  MILLER_MOBILE_QUERY_BENCHMARK,
  MILLER_NATIONAL_QUERY_BENCHMARK,
  MILLER_NORTHERN_QUERY_BENCHMARK,
  runMillerMobileQueryBenchmark,
  runMillerNorthernPathwayBenchmark,
} from "../server/millerMobileBenchmark.js"
import { buildMillerMobileInventory } from "../server/millerMobileApi.js"

const now = () => new Date("2026-09-09T12:00:00.000Z")
const output = {
  schema_version: "miller-navigator-home-community-handoff-benchmark-v1",
  generated_at: now().toISOString(),
  inventory: buildMillerMobileInventory(millerMobileCatalog),
  professional_regression: runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_MOBILE_QUERY_BENCHMARK }),
  national_regression: runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NATIONAL_QUERY_BENCHMARK }),
  northern_regression: runMillerNorthernPathwayBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NORTHERN_QUERY_BENCHMARK }),
  home_community_handoffs: runMillerNorthernPathwayBenchmark(millerMobileCatalog, { now, scenarios: MILLER_HOME_COMMUNITY_HANDOFF_BENCHMARK }),
}

await writeFile(new URL("../reports/miller-navigator-home-community-handoff-benchmark-2026-09-09.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  resources: output.inventory.total,
  mobile_ready: output.inventory.readiness.mobile_ready,
  readiness_rate: output.inventory.readiness.readiness_rate,
  professional: `${output.professional_regression.passing_queries}/${output.professional_regression.query_count}`,
  national: `${output.national_regression.passing_queries}/${output.national_regression.query_count}`,
  northern: `${output.northern_regression.passing_scenarios}/${output.northern_regression.scenario_count}`,
  handoffs: `${output.home_community_handoffs.passing_scenarios}/${output.home_community_handoffs.scenario_count}`,
  false_local_facility_claims: output.home_community_handoffs.false_local_facility_claims,
}))
