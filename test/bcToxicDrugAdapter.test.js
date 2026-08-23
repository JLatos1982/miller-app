import test from "node:test"
import assert from "node:assert/strict"
import { BC_TOXIC_DRUG, classifyBcToxicDrugAlert } from "../server/bcToxicDrugAdapter.js"
test("BC toxic-drug source is fixture-only until a stable first-party machine feed exists", () => { assert.equal(BC_TOXIC_DRUG.mode,"fixture_validated_live_disabled"); assert.equal(BC_TOXIC_DRUG.maxRequests,0) })
test("controlled alert fixture retains only supported public-health fields", () => { const alert = classifyBcToxicDrugAlert({ id:"one", region:"fraser", issued_at:"2026-08-23T00:00:00Z", alert_type:"drug_alert", substance:"stimulant", expires_at:"2026-08-24T00:00:00Z" }); assert.equal(alert.signal_family,"toxic_drug"); assert.equal(alert.decay_class,"fast"); assert.equal(alert.reflex_eligible,true) })
