import { createHash } from "node:crypto"

// BCCDC identifies Toward the Heart as its partnered alert delivery mechanism.
// No documented machine-readable alert feed was found, so live retrieval remains
// deliberately disabled pending a stable first-party contract.
export const BC_TOXIC_DRUG = Object.freeze({ id: "bc_toxic_drug", source: "https://mail.towardtheheart.com/alerts", host: "mail.towardtheheart.com", mode: "fixture_validated_live_disabled", cadence: "fast", maxRequests: 0, maxRecords: 20 })
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 500)
export function classifyBcToxicDrugAlert(alert = {}) { const id = clean(alert.id, 120), region = clean(alert.region, 80).toLowerCase().replace(/[^a-z_]/g, "_"); if (!id || !["fraser","vancouver_coastal","island","interior","northern","province"].includes(region) || !alert.issued_at) return null; const type = clean(alert.alert_type, 80).toLowerCase(); if (!/(drug_alert|overdose_advisory|toxic_drug_alert)/.test(type)) return null; const substance = clean(alert.substance, 80).toLowerCase().replace(/[^a-z0-9_]/g, "_") || "unspecified"; return { stable_result_id: `bc_alert:${id}`, region, substance, issued_at: alert.issued_at, expires_at: alert.expires_at || null, alert_type: type, fingerprint: createHash("sha256").update([id, region, substance, alert.issued_at, alert.expires_at || ""].join("|")).digest("hex"), signal_family: "toxic_drug", signal_type: "toxic_drug_alert", source_authority: 90, decay_class: "fast", reflex_eligible: true, provenance: { source: BC_TOXIC_DRUG.source, live_disabled: true, raw_alert_retained: false } }
}
