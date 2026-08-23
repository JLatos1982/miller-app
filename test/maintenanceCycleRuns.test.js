import test from "node:test"
import assert from "node:assert/strict"
import { createMaintenanceCycleStore } from "../server/maintenanceCycleRuns.js"
test("maintenance store refuses an active cycle", async () => { const chain = { select(){ return this }, eq(){ return this }, order(){ return this }, limit(){ return this }, async maybeSingle(){ return { data: { id: "active", started_at: new Date().toISOString() }, error: null } } }; const store = createMaintenanceCycleStore({ from(){ return chain } }); assert.equal((await store.start()).already_running, true) })
