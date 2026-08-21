import test from "node:test"
import assert from "node:assert/strict"
import { capabilityReport } from "../server/capabilities.js"

test("capability diagnostic reports presence without secret values", () => { const report = capabilityReport({ OPENAI_API_KEY: "do-not-expose", SUPABASE_URL: "configured", SUPABASE_SERVICE_ROLE_KEY: "also-secret" }); assert.equal(report.capabilities.find((item) => item.id === "miller_ai").status, "configured"); assert.equal(report.capabilities.find((item) => item.id === "translink_alerts").status, "not_configured"); assert.doesNotMatch(JSON.stringify(report), /do-not-expose|also-secret/) })
test("211 and Pathways remain honest placeholders", () => { const capabilities = capabilityReport({}).capabilities; assert.equal(capabilities.find((item) => item.id === "bc211").status, "pending_access"); assert.equal(capabilities.find((item) => item.id === "pathways").status, "not_integrated") })
