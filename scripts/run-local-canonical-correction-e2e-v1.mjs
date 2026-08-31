import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { correctionRequestFingerprint, validateCanonicalCorrectionRequest } from "../server/canonicalFieldCorrection.js"
import { canonicalProfileFingerprint } from "../server/canonicalProfile.js"

const required = ["LOCAL_SUPABASE_URL", "LOCAL_SUPABASE_SERVICE_ROLE_KEY", "PARITY_EXPORT_DIR"]
for (const key of required) if (!process.env[key]) throw new Error(`${key}_is_required`)

const supabase = createClient(process.env.LOCAL_SUPABASE_URL, process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const exportDir = resolve(process.env.PARITY_EXPORT_DIR)
const CONTRACT = "miller-canonical-field-correction-v1"
const fingerprintVectors = JSON.parse(readFileSync(new URL("../test/fixtures/canonical-profile-fingerprint-v1.json", import.meta.url), "utf8"))
const ids = Object.freeze({
  resource: "00000000-0000-4000-8000-00000000e201",
  location: "00000000-0000-4000-8000-00000000e202",
  cityClaim: "00000000-0000-4000-8000-00000000e203",
  cityEvidence: "00000000-0000-4000-8000-00000000e204",
  phoneClaim: "00000000-0000-4000-8000-00000000e205",
  phoneEvidence: "00000000-0000-4000-8000-00000000e206",
  staleClaim: "00000000-0000-4000-8000-00000000e207",
  staleEvidence: "00000000-0000-4000-8000-00000000e208",
  cityCorrection: "00000000-0000-4000-8000-00000000e209",
  phoneCorrection: "00000000-0000-4000-8000-00000000e210",
  staleCorrection: "00000000-0000-4000-8000-00000000e211",
})

const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
const fail = (message, detail) => { throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`) }
const query = async (promise, label) => { const { data, error, count } = await promise; if (error) fail(label, error); return { data, count } }
const count = async (table) => (await query(supabase.from(table).select("*", { count: "exact", head: true }), `count_${table}`)).count
const canonical = (value) => JSON.parse(JSON.stringify(value))

function request({ correctionId, field, expectedCurrentValue, expectedProfileVersion, expectedProfileAbsent, expectedFingerprint, proposedValue, locationId, evidenceId, evidenceFingerprint }) {
  const value = {
    contract: CONTRACT,
    correction_id: correctionId,
    resource_id: ids.resource,
    field,
    expected_current_value: expectedCurrentValue,
    expected_profile_version: expectedProfileVersion,
    expected_profile_absent: expectedProfileAbsent,
    expected_canonical_fingerprint: expectedFingerprint,
    proposed_value: proposedValue,
    canonical_location_id: locationId,
    supporting_evidence_bindings: [{ evidence_id: evidenceId, evidence_fingerprint: evidenceFingerprint, field }],
    policy_version: CONTRACT,
    requester_id: "samwise:local-e2e-v1",
    created_at: "2026-08-31T16:00:00.000Z",
    expires_at: "2036-08-31T16:30:00.000Z",
  }
  value.request_fingerprint = correctionRequestFingerprint(value)
  return validateCanonicalCorrectionRequest(value, Date.parse("2026-08-31T16:01:00.000Z"))
}

async function seedClaimAndEvidence({ claimId, evidenceId, field, value, suffix }) {
  const evidenceFingerprint = sha256(`synthetic-local-e2e-evidence-${suffix}`)
  await query(supabase.from("resource_fact_claims").insert({
    id: claimId, resource_id: ids.resource, field_name: field, proposed_value: { field, value }, existing_value: null,
    risk: "low", recommendation: "auto_accept", confidence: "high", reason_codes: ["synthetic_local_e2e"],
    engine_version: "synthetic-local-e2e-v1", status: "accepted", decision_category: "other", claim_fingerprint: sha256(`synthetic-local-e2e-claim-${suffix}`),
  }), `seed_claim_${field}_${suffix}`)
  await query(supabase.from("resource_fact_evidence").insert({
    id: evidenceId, claim_id: claimId, source_type: "synthetic_authoritative_registry", source_record_id: `synthetic-${suffix}`,
    source_url: `https://synthetic.local/e2e/${suffix}`, extraction_method: "manual_verified", source_authority: 100,
    independent_key: `synthetic-local-e2e-${suffix}`, stale: false, evidence_fingerprint: evidenceFingerprint,
    extracted_value: { field, value, authoritative: true, no_conflict: true, confidence: "high", privacy_safe: true },
  }), `seed_evidence_${field}_${suffix}`)
  return evidenceFingerprint
}

async function rpc(requestValue, preview) {
  return (await query(supabase.rpc("apply_miller_canonical_field_correction_v1", { p_request: requestValue, p_preview: preview }), preview ? "preview" : "apply")).data
}

async function main() {
  // This runner is deliberately local-only. The caller supplies a 127.0.0.1
  // Supabase URL and a temporary service key from `supabase status`.
  if (!/^http:\/\/127\.0\.0\.1:/.test(process.env.LOCAL_SUPABASE_URL)) fail("local_url_required")
  for (const vector of fingerprintVectors) {
    const input = vector.input
    const databaseFingerprint = (await query(supabase.rpc("canonical_profile_fingerprint_v1", {
      p_phone: input.phone, p_website: input.website, p_location_id: input.canonical_location_id,
      p_city: input.city, p_province: input.province, p_street: input.public_street_address, p_version: input.version,
    }), `canonical_fingerprint_parity_${vector.id}`)).data
    const expectedFingerprint = canonicalProfileFingerprint(input)
    if (databaseFingerprint !== vector.sha256 || expectedFingerprint !== vector.sha256) fail("canonical_fingerprint_contract_drift", { vector: vector.id, databaseFingerprint, expectedFingerprint, expectedVectorFingerprint: vector.sha256 })
  }
  await query(supabase.from("resource_registry").insert({ id: ids.resource, display_name: "Synthetic Canonical E2E Resource", lifecycle_state: "active", editorial_status: "approved" }), "seed_resource")
  await query(supabase.from("resource_locations").insert({
    id: ids.location, resource_id: ids.resource, location_label: "Synthetic public canonical location", location_type: "fixed",
    original_address_text: "100 Synthetic Start Road", street_address: "100 Synthetic Start Road", city: "Synthetic Start City",
    province: "BC", country: "Canada", geocode_status: "not_required", review_status: "approved", public_map: false,
  }), "seed_location")
  const cityEvidenceFingerprint = await seedClaimAndEvidence({ claimId: ids.cityClaim, evidenceId: ids.cityEvidence, field: "city", value: "Synthetic Corrected City", suffix: "city" })
  const phoneEvidenceFingerprint = await seedClaimAndEvidence({ claimId: ids.phoneClaim, evidenceId: ids.phoneEvidence, field: "phone", value: "+16045550101", suffix: "phone" })
  const staleEvidenceFingerprint = await seedClaimAndEvidence({ claimId: ids.staleClaim, evidenceId: ids.staleEvidence, field: "phone", value: "+16045550102", suffix: "stale" })

  const beforePreview = { profile: await count("resource_canonical_profile"), audit: await count("resource_canonical_profile_audit"), ledger: await count("miller_canonical_field_corrections") }
  const cityRequest = request({ correctionId: ids.cityCorrection, field: "city", expectedCurrentValue: "Synthetic Start City", expectedProfileVersion: null, expectedProfileAbsent: true, expectedFingerprint: null, proposedValue: "Synthetic Corrected City", locationId: ids.location, evidenceId: ids.cityEvidence, evidenceFingerprint: cityEvidenceFingerprint })
  const preview = await rpc(cityRequest, true)
  const afterPreview = { profile: await count("resource_canonical_profile"), audit: await count("resource_canonical_profile_audit"), ledger: await count("miller_canonical_field_corrections") }
  if (JSON.stringify(beforePreview) !== JSON.stringify(afterPreview)) fail("preview_mutated_state", { beforePreview, afterPreview })
  if (preview.outcome !== "preview" || preview.projected_version !== 1 || preview.proposed_value !== "Synthetic Corrected City") fail("preview_contract_mismatch", preview)

  const cityApply = await rpc(cityRequest, false)
  if (cityApply.outcome !== "verified_updated" || cityApply.new_version !== 1 || cityApply.current_value !== "Synthetic Corrected City") fail("city_apply_contract_mismatch", cityApply)
  const { data: profileAfterCity } = await query(supabase.from("resource_canonical_profile").select("*").eq("resource_id", ids.resource).single(), "profile_after_city")
  const { data: locationAfterCity } = await query(supabase.from("resource_locations").select("*").eq("id", ids.location).single(), "location_after_city")
  const cityFingerprint = canonicalProfileFingerprint({ phone: null, website: null, canonical_location_id: ids.location, city: "Synthetic Corrected City", province: "BC", public_street_address: "100 Synthetic Start Road", version: 1 })
  if (profileAfterCity.canonical_location_id !== ids.location || profileAfterCity.phone !== null || profileAfterCity.website !== null || locationAfterCity.city !== "Synthetic Corrected City" || profileAfterCity.canonical_fingerprint !== cityFingerprint || cityApply.new_fingerprint !== cityFingerprint) fail("city_post_write_verification_failed", { profileAfterCity, locationAfterCity, cityApply, cityFingerprint })

  const phoneRequest = request({ correctionId: ids.phoneCorrection, field: "phone", expectedCurrentValue: null, expectedProfileVersion: 1, expectedProfileAbsent: false, expectedFingerprint: cityFingerprint, proposedValue: "+1 (604) 555-0101", locationId: null, evidenceId: ids.phoneEvidence, evidenceFingerprint: phoneEvidenceFingerprint })
  const phoneApply = await rpc(phoneRequest, false)
  if (phoneApply.outcome !== "verified_updated" || phoneApply.new_version !== 2 || phoneApply.current_value !== "+16045550101") fail("phone_apply_contract_mismatch", phoneApply)
  const { data: profileAfterPhone } = await query(supabase.from("resource_canonical_profile").select("*").eq("resource_id", ids.resource).single(), "profile_after_phone")
  const phoneFingerprint = canonicalProfileFingerprint({ phone: "+16045550101", website: null, canonical_location_id: ids.location, city: "Synthetic Corrected City", province: "BC", public_street_address: "100 Synthetic Start Road", version: 2 })
  if (profileAfterPhone.canonical_fingerprint !== phoneFingerprint || phoneApply.new_fingerprint !== phoneFingerprint || profileAfterPhone.canonical_location_id !== ids.location || locationAfterCity.city !== "Synthetic Corrected City") fail("phone_post_write_verification_failed", { profileAfterPhone, phoneApply, phoneFingerprint })

  const replay = await rpc(phoneRequest, false)
  if (JSON.stringify(canonical(replay)) !== JSON.stringify(canonical(phoneApply))) fail("idempotent_replay_result_mismatch", { replay, phoneApply })
  const afterReplay = { profile: await count("resource_canonical_profile"), audit: await count("resource_canonical_profile_audit"), ledger: await count("miller_canonical_field_corrections") }
  if (afterReplay.profile !== 1 || afterReplay.audit !== 2 || afterReplay.ledger !== 2) fail("idempotent_replay_mutated_state", afterReplay)

  const staleRequest = request({ correctionId: ids.staleCorrection, field: "phone", expectedCurrentValue: "+16045550101", expectedProfileVersion: 1, expectedProfileAbsent: false, expectedFingerprint: cityFingerprint, proposedValue: "+16045550102", locationId: null, evidenceId: ids.staleEvidence, evidenceFingerprint: staleEvidenceFingerprint })
  const stale = await rpc(staleRequest, false)
  if (stale.outcome !== "stale_before_write") fail("stale_rejection_contract_mismatch", stale)
  const afterStale = { profile: await count("resource_canonical_profile"), audit: await count("resource_canonical_profile_audit"), ledger: await count("miller_canonical_field_corrections") }
  if (JSON.stringify(afterStale) !== JSON.stringify(afterReplay)) fail("stale_request_mutated_state", { afterReplay, afterStale })

  const { data: audit } = await query(supabase.from("resource_canonical_profile_audit").select("*").eq("id", phoneApply.audit_id).single(), "phone_audit")
  const { data: ledger } = await query(supabase.from("miller_canonical_field_corrections").select("*").eq("correction_id", ids.phoneCorrection).single(), "phone_ledger")
  if (audit.outcome !== "verified_updated" || ledger.outcome !== "verified_updated" || audit.request_fingerprint !== phoneRequest.request_fingerprint || JSON.stringify(ledger.result) !== JSON.stringify(phoneApply)) fail("atomic_audit_or_ledger_verification_failed", { audit, ledger, phoneApply })
  const rollbackReady = { correction_id: phoneApply.correction_id, resource_id: ids.resource, prior_value: phoneApply.prior_value, current_value: phoneApply.current_value, prior_version: phoneApply.prior_version, current_version: phoneApply.new_version, prior_fingerprint: phoneApply.prior_fingerprint, current_fingerprint: phoneApply.new_fingerprint, audit_id: phoneApply.audit_id }
  if (Object.values(rollbackReady).some((value) => value === undefined)) fail("rollback_result_incomplete", rollbackReady)

  mkdirSync(exportDir, { recursive: true })
  const vectors = {
    "city-first-profile-request.json": cityRequest,
    "city-preview-response.json": preview,
    "city-apply-response.json": cityApply,
    "phone-update-request.json": phoneRequest,
    "phone-apply-response.json": phoneApply,
    "phone-idempotent-replay-response.json": replay,
    "phone-stale-request.json": staleRequest,
    "phone-stale-response.json": stale,
    "rollback-ready-proposal.json": rollbackReady,
    "canonicalization-rules.json": {
      contract: CONTRACT, policy_version: CONTRACT,
      field_mapping: { phone: "resource_canonical_profile.phone", website: "resource_canonical_profile.website", city: "resource_locations.city via resource_canonical_profile.canonical_location_id", province: "resource_locations.province via resource_canonical_profile.canonical_location_id", public_street_address: "resource_locations.street_address via resource_canonical_profile.canonical_location_id" },
      phone: "E.164; non-digits removed except leading plus", website: "HTTPS; lower-cased; trailing slashes removed",
      fingerprint: "sha256(miller-canonical-profile-v1 plus length-delimited phone, website, canonical_location_id, city, province, public_street_address, version)",
    },
  }
  const hashes = {}
  for (const [name, value] of Object.entries(vectors)) { const serialized = `${JSON.stringify(value, null, 2)}\n`; writeFileSync(resolve(exportDir, name), serialized); hashes[name] = sha256(serialized) }
  const manifest = { contract: CONTRACT, source_miller_commit: process.env.SOURCE_MILLER_COMMIT || "unknown", synthetic_only: true, production_data_or_credentials_included: false, vectors: hashes }
  const manifestSerialized = `${JSON.stringify(manifest, null, 2)}\n`
  writeFileSync(resolve(exportDir, "manifest.json"), manifestSerialized)
  const report = { outcome: "canonical_correction_local_e2e_and_samwise_parity_verified", fixture: { resource_id: ids.resource, location_id: ids.location, evidence_ids: [ids.cityEvidence, ids.phoneEvidence, ids.staleEvidence] }, preview, city_apply: cityApply, phone_apply: phoneApply, replay, stale, counts: { beforePreview, afterPreview, afterReplay, afterStale }, rollback_ready: rollbackReady, hashes, manifest_sha256: sha256(manifestSerialized) }
  writeFileSync(resolve(exportDir, "local-e2e-report.json"), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
