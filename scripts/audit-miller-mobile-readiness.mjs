import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  auditMillerMobileSharePacks,
  buildMillerMobileCoverageMatrix,
  runMillerMobileQueryBenchmark,
} from "../server/millerMobileBenchmark.js"
import { buildMillerMobileInventory } from "../server/millerMobileApi.js"

const now = () => new Date("2026-09-08T12:00:00.000Z")
const benchmark = runMillerMobileQueryBenchmark(millerMobileCatalog, { now })
const coverage = buildMillerMobileCoverageMatrix(millerMobileCatalog, { now: now() })

console.log(JSON.stringify({
  schema_version: "miller-mobile-data-readiness-audit-v1",
  generated_at: now().toISOString(),
  inventory: buildMillerMobileInventory(millerMobileCatalog),
  benchmark,
  coverage,
  share_pack_qa: auditMillerMobileSharePacks(millerMobileCatalog, { now }),
  privacy_boundary: {
    allowed: ["verified practical service", "funding", "navigation", "public contact and access metadata"],
    excluded: ["Miller North evidence", "Farm intelligence", "owner review", "legal or investigative records", "secrets"],
  },
}, null, 2))
