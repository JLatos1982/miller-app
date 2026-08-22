import test from "node:test"
import assert from "node:assert/strict"
import { compassionPriority, humanImpact, neutralLanguage } from "../server/compassionPolicy.js"
test("compassion is a bounded service-level priority context, not a truth or safety override", () => { const result = compassionPriority({ priority: 95, signal_type: "service_change", service_scope: "withdrawal_management", reason_codes: ["closure","limited_alternatives"], reflex_eligible: true }); assert.equal(result.human_impact, "critical"); assert.equal(result.priority, 100); assert.equal(result.can_bypass_safety, false); assert.equal(result.can_establish_truth, false) })
test("protected locations retain safety protection regardless of human impact", () => { const result = humanImpact({ protected: true, signal_family: "toxic_drug", reason_codes: ["protected_or_sensitive"] }); assert.equal(result.protected_block_remains, true); assert.equal(result.priority_adjustment, 0) })
test("controlled summaries use neutral person-centered language without changing provenance", () => { assert.equal(neutralLanguage("An addict needs a clean urine"), "A person who uses drugs needs a negative toxicology result") })
