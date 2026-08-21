import { createHash } from "node:crypto"

const stable = (value) => JSON.stringify(value, Object.keys(value || {}).sort())
export const shelterResearchFingerprint = (...parts) => createHash("sha256").update(parts.map((part) => typeof part === "string" ? part : stable(part)).join("\u001f")).digest("hex")

export function createShelterCandidateResearchPersistence({ supabase, now = () => new Date().toISOString() }) {
  async function persist({ candidateId, recommendation, proposedValue = null, currentValue = null, confidence = "unknown", reasonCodes = [], researchVersion, summary = null, evidence = [] }) {
    const claimFingerprint = shelterResearchFingerprint(candidateId, recommendation, proposedValue, researchVersion)
    const row = { candidate_id: candidateId, recommendation, proposed_value: proposedValue, current_value: currentValue, confidence, reason_codes: [...new Set(reasonCodes)], research_version: researchVersion, claim_fingerprint: claimFingerprint, research_summary: summary, last_retrieved_at: now(), updated_at: now() }
    const existing = await supabase.from("shelter_candidate_research_claims").select("*").eq("claim_fingerprint", claimFingerprint).maybeSingle()
    if (existing.error) throw existing.error
    const claim = existing.data ? await supabase.from("shelter_candidate_research_claims").update(row).eq("id", existing.data.id).select().single() : await supabase.from("shelter_candidate_research_claims").insert(row).select().single()
    if (claim.error) throw claim.error
    let evidenceCreated = 0
    for (const item of evidence) {
      const fingerprint = shelterResearchFingerprint(claim.data.id, item.sourceUrl, item.extractedValue, item.extractionMethod)
      const duplicate = await supabase.from("shelter_candidate_research_evidence").select("id").eq("evidence_fingerprint", fingerprint).maybeSingle()
      if (duplicate.error) throw duplicate.error
      if (!duplicate.data) { const saved = await supabase.from("shelter_candidate_research_evidence").insert({ claim_id: claim.data.id, source_url: item.sourceUrl, source_title: item.sourceTitle || null, source_type: item.sourceType, source_authority: item.sourceAuthority, retrieved_at: item.retrievedAt || now(), extraction_method: item.extractionMethod, extracted_value: item.extractedValue ?? null, evidence_fingerprint: fingerprint, stale: item.stale === true }); if (saved.error) throw saved.error; evidenceCreated += 1 }
    }
    return { claim: claim.data, created: !existing.data, evidenceCreated, candidateStatusChanged: false, canonicalResourceCreated: false, locationCreated: false, publicationChanged: false }
  }
  return { persist }
}
