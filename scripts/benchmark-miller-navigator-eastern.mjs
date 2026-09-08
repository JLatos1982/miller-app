import { writeFile } from "node:fs/promises"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import { buildMillerMobileInventory } from "../server/millerMobileApi.js"
import {
  MILLER_EASTERN_QUERY_BENCHMARK,
  MILLER_HEALTHCARE_ADJACENT_QUERY_BENCHMARK,
  MILLER_MOBILE_QUERY_BENCHMARK,
  MILLER_NATIONAL_QUERY_BENCHMARK,
  MILLER_NORTHERN_QUERY_BENCHMARK,
  runMillerHealthcareAdjacentBenchmark,
  runMillerMobileQueryBenchmark,
  runMillerNorthernPathwayBenchmark,
} from "../server/millerMobileBenchmark.js"

const now = () => new Date("2026-09-08T12:00:00.000Z")
const output = {
  schema_version: "miller-navigator-eastern-foundation-benchmark-v1",
  generated_at: now().toISOString(),
  inventory: buildMillerMobileInventory(millerMobileCatalog),
  eastern: runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_EASTERN_QUERY_BENCHMARK }),
  healthcare_adjacent: runMillerHealthcareAdjacentBenchmark(millerMobileCatalog, { now, scenarios: MILLER_HEALTHCARE_ADJACENT_QUERY_BENCHMARK }),
  national_regression: runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NATIONAL_QUERY_BENCHMARK }),
  western_regression: runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_MOBILE_QUERY_BENCHMARK }),
  northern_regression: runMillerNorthernPathwayBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NORTHERN_QUERY_BENCHMARK }),
}

await writeFile(new URL("../reports/miller-navigator-eastern-foundation-benchmark-2026-09-08.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  inventory: output.inventory,
  eastern: `${output.eastern.passing_queries}/${output.eastern.query_count}`,
  healthcare_adjacent: `${output.healthcare_adjacent.passing_scenarios}/${output.healthcare_adjacent.scenario_count}`,
  national: `${output.national_regression.passing_queries}/${output.national_regression.query_count}`,
  western: `${output.western_regression.passing_queries}/${output.western_regression.query_count}`,
  northern: `${output.northern_regression.passing_scenarios}/${output.northern_regression.scenario_count}`,
  false_local_facility_claims: output.eastern.rows.reduce((sum, row) => sum + row.incorrect_local_facility_claims, 0)
    + output.northern_regression.false_local_facility_claims,
}, null, 2))
