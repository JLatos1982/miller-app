import assert from "node:assert/strict"
import test from "node:test"

import { millerNorthFarmRoutingTable, routeMillerNorthFarmTask } from "../server/millerNorthFarmRouting.js"

test("Farm routing uses deterministic and local stages before stronger research", () => {
  const routes = millerNorthFarmRoutingTable()
  assert.ok(routes.some(item => item.task === "query_expansion" && /deterministic/.test(item.worker)))
  assert.ok(routes.some(item => item.task === "bounded_classification" && item.worker === "qwen_local_light"))
  assert.equal(routeMillerNorthFarmTask("accountability_link").review, "owner_required")
  assert.ok(routes.every(item => item.raw_evidence_write === false && item.publication_write === false))
})
