import { createHash } from "node:crypto"

const safeText = (value, max = 2_000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
const stable = (value) => JSON.stringify(value, Object.keys(value || {}).sort())
export const shadowFingerprint = (...parts) => createHash("sha256").update(parts.map((part) => typeof part === "string" ? part : stable(part)).join("\u001f")).digest("hex")
export const recommendationStatus = (recommendation) => ({ human_review: "needs_review", reject: "rejected", unknown: "unknown" }[recommendation] || "observed")

export function normalizeShadowEvidence(evidence = {}) {
  let sourceUrl = null
  try { const parsed = new URL(String(evidence.url || evidence.sourceUrl || "")); if (parsed.protocol === "https:") sourceUrl = parsed.toString() } catch { /* invalid URLs are not persisted */ }
  const sourceType = safeText(evidence.sourceType || "unknown", 80) || "unknown"
  const independentKey = safeText(evidence.independentKey || (sourceUrl ? new URL(sourceUrl).hostname : sourceType), 300) || sourceType
  const extractedValue = evidence.value ?? evidence.extractedValue ?? null
  return { source_type: sourceType, source_record_id: safeText(evidence.sourceRecordId, 300) || null, source_url: sourceUrl, extracted_value: extractedValue, extraction_method: safeText(evidence.extractionMethod || "bounded_research", 120), retrieved_at: evidence.retrievedAt || new Date().toISOString(), source_authority: Math.max(0, Math.min(100, Number(evidence.sourceAuthority ?? evidence.authority ?? 0) || 0)), independent_key: independentKey, stale: evidence.stale === true }
}

export function createShadowPersistence({ supabase, now = () => new Date().toISOString() }) {
  async function controls() {
    const { data, error } = await supabase.from("miller_automation_controls").select("*").eq("id", true).maybeSingle()
    if (error || !data) throw new Error("shadow_controls_unavailable")
    return data
  }

  async function assertObserveOnly() {
    const value = await controls()
    const safe = value.shadow_enabled === true && value.observe_only === true && value.low_risk_fact_updates_enabled === false && value.routine_location_validation_enabled === false && value.automatic_location_publication_enabled === false && value.automatic_resource_publication_enabled === false && value.maintenance_updates_enabled === false
    if (!safe) throw new Error("shadow_kill_switch_or_write_mode_active")
    return value
  }

  async function persistObservation(input) {
    await assertObserveOnly()
    const observedAt = now(), proposedValue = input.proposedValue ?? null
    const fingerprint = shadowFingerprint(input.resourceId || "unresolved", input.field, proposedValue, input.engineVersion || "miller-shadow-v1")
    const claim = { resource_id: input.resourceId || null, field_name: safeText(input.field, 80), proposed_value: proposedValue, existing_value: input.currentValue ?? null, risk: input.risk, recommendation: input.recommendation, confidence: input.confidence, reason_codes: [...new Set(input.reasonCodes || [])].slice(0, 30), engine_version: safeText(input.engineVersion || "miller-shadow-v1", 120), status: recommendationStatus(input.recommendation), claim_fingerprint: fingerprint, decision_category: safeText(input.category || input.field || "other", 80), research_summary: safeText(input.summary, 2_000) || null, last_observed_at: observedAt, updated_at: observedAt }
    let existing = await supabase.from("resource_fact_claims").select("*").eq("claim_fingerprint", fingerprint).maybeSingle()
    if (existing.error) throw existing.error
    let saved, created = false
    if (existing.data) {
      const update = await supabase.from("resource_fact_claims").update({ research_summary: claim.research_summary, last_observed_at: observedAt, reason_codes: claim.reason_codes, updated_at: observedAt }).eq("id", existing.data.id).select().single()
      if (update.error) throw update.error
      saved = update.data
    } else {
      const insert = await supabase.from("resource_fact_claims").insert(claim).select().single()
      if (insert.error?.code === "23505") {
        existing = await supabase.from("resource_fact_claims").select("*").eq("claim_fingerprint", fingerprint).single()
        if (existing.error) throw existing.error
        saved = existing.data
      } else if (insert.error) throw insert.error
      else { saved = insert.data; created = true }
    }
    let evidenceCreated = 0
    for (const raw of (input.evidence || []).slice(0, 30)) {
      const evidence = normalizeShadowEvidence(raw), evidenceFingerprint = shadowFingerprint(saved.id, evidence.source_type, evidence.source_url || "", evidence.independent_key, evidence.extracted_value)
      const duplicate = await supabase.from("resource_fact_evidence").select("id").eq("evidence_fingerprint", evidenceFingerprint).maybeSingle()
      if (duplicate.error) throw duplicate.error
      if (!duplicate.data) {
        const result = await supabase.from("resource_fact_evidence").insert({ ...evidence, claim_id: saved.id, evidence_fingerprint: evidenceFingerprint })
        if (result.error && result.error.code !== "23505") throw result.error
        if (!result.error) evidenceCreated += 1
      }
    }
    return { claim: saved, created, evidenceProcessed: evidenceCreated, trustedRecordChanged: false, publicationChanged: false }
  }

  async function listQueue() {
    const [controlResult, claimResult] = await Promise.all([controls(), supabase.from("resource_fact_claims").select("*").neq("decision_category", "system_verification").order("last_observed_at", { ascending: false }).limit(1000)])
    if (claimResult.error) throw claimResult.error
    const ids = (claimResult.data || []).map((item) => item.id)
    const evidenceResult = ids.length ? await supabase.from("resource_fact_evidence").select("*").in("claim_id", ids).order("source_authority", { ascending: false }) : { data: [], error: null }
    if (evidenceResult.error) throw evidenceResult.error
    const evidence = new Map()
    for (const item of evidenceResult.data || []) evidence.set(item.claim_id, [...(evidence.get(item.claim_id) || []), item])
    return { controls: controlResult, claims: (claimResult.data || []).map((item) => ({ ...item, evidence: evidence.get(item.id) || [] })) }
  }

  async function decide({ claimId, expectedVersion, action, actorId }) {
    await assertObserveOnly()
    const allowed = new Set(["accept", "keep_existing", "reject", "mark_unknown"])
    if (!allowed.has(action)) throw new Error("invalid_shadow_action")
    const result = await supabase.rpc("save_resource_fact_shadow_decision", { p_claim_id: claimId, p_expected_version: expectedVersion, p_action: action, p_actor_id: actorId })
    if (result.error) throw result.error
    return result.data
  }

  return { assertObserveOnly, controls, decide, listQueue, persistObservation }
}
