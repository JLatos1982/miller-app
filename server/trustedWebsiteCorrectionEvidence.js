import { createHash } from "node:crypto"
import { normalizeCanonicalWebsite } from "./canonicalProfile.js"
import { fetchSafeResearchDocument } from "./review/linkQuality.js"

export const TRUSTED_WEBSITE_CORRECTION_EVIDENCE_CONTRACT = "miller-trusted-website-correction-evidence-v1"
export const TRUSTED_WEBSITE_CORRECTION_EVIDENCE_POLICY = "miller-trusted-website-correction-evidence-v1"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REQUEST_KEYS = new Set(["contract", "resource_id", "proposed_website", "authoritative_source_url", "source_content", "source_retrieved_at"])
const FORBIDDEN_TRUST_KEYS = new Set(["field", "value", "authoritative", "no_conflict", "confidence", "privacy_safe", "source_authority", "extraction_method", "evidence_fingerprint"])
const MAX_CONTENT_CHARS = 6_000
const MAX_SOURCE_AGE_MS = 24 * 60 * 60 * 1_000

function digest(value) { return createHash("sha256").update(value).digest("hex") }
function sourceText(value) { return String(value || "").replace(/\s+/g, " ").trim() }
function normalizedUrl(value) { const url = new URL(value); return url.toString() }

function publicCanonicalWebsite(value) {
  const website = normalizeCanonicalWebsite(value)
  const url = new URL(website)
  if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw new Error("private_or_noncanonical_website")
  return website
}

export function validateTrustedWebsiteCorrectionEvidenceRequest(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("rejected")
  for (const key of Object.keys(input)) if (!REQUEST_KEYS.has(key) || FORBIDDEN_TRUST_KEYS.has(key)) throw new Error("rejected")
  if (input.contract !== TRUSTED_WEBSITE_CORRECTION_EVIDENCE_CONTRACT || !UUID.test(input.resource_id || "")) throw new Error("rejected")
  const website = publicCanonicalWebsite(input.proposed_website)
  let sourceUrl
  try { sourceUrl = new URL(String(input.authoritative_source_url || "")) } catch { throw new Error("rejected") }
  if (sourceUrl.protocol !== "https:" || sourceUrl.username || sourceUrl.password || sourceUrl.hash) throw new Error("rejected")
  const content = sourceText(input.source_content)
  if (content.length < 30 || content.length > MAX_CONTENT_CHARS) throw new Error("rejected")
  const retrievedAt = Date.parse(input.source_retrieved_at)
  if (!Number.isFinite(retrievedAt) || retrievedAt > now + 5 * 60_000 || now - retrievedAt > MAX_SOURCE_AGE_MS) throw new Error("stale_source")
  return { resource_id: input.resource_id, proposed_website: website, authoritative_source_url: normalizedUrl(sourceUrl), source_content: content, source_retrieved_at: new Date(retrievedAt).toISOString() }
}

export async function prepareTrustedWebsiteCorrectionEvidence(input, { loadResource, fetchDocument = fetchSafeResearchDocument, now = () => Date.now() } = {}) {
  const request = validateTrustedWebsiteCorrectionEvidenceRequest(input, now())
  const resource = await loadResource(request.resource_id)
  if (!resource || resource.lifecycle_state !== "active" || resource.editorial_status === "hidden" || !sourceText(resource.display_name)) throw new Error("identity_mismatch")
  const expected = new URL(request.proposed_website), source = new URL(request.authoritative_source_url)
  if (expected.hostname !== source.hostname) throw new Error("non_first_party_source")
  const document = await fetchDocument(request.authoritative_source_url)
  if (!document?.ok || document.redirects !== 0 || normalizedUrl(document.url) !== request.authoritative_source_url) throw new Error("redirected_or_unrelated_source")
  const fetched = sourceText(document.text)
  if (!fetched.includes(request.source_content) || !fetched.toLowerCase().includes(resource.display_name.toLowerCase()) || !fetched.toLowerCase().includes(request.proposed_website.toLowerCase())) throw new Error("identity_or_website_not_verified")
  return {
    resource_id: request.resource_id,
    proposed_website: request.proposed_website,
    source_url: request.authoritative_source_url,
    source_retrieved_at: new Date(now()).toISOString(),
    source_content_sha256: digest(request.source_content),
    validation_version: TRUSTED_WEBSITE_CORRECTION_EVIDENCE_POLICY,
  }
}

export async function persistTrustedWebsiteCorrectionEvidence({ input, supabase, preview = false, fetchDocument, now } = {}) {
  const prepared = await prepareTrustedWebsiteCorrectionEvidence(input, {
    now,
    fetchDocument,
    loadResource: async (resourceId) => {
      const result = await supabase.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("id", resourceId).maybeSingle()
      if (result.error) throw result.error
      return result.data
    },
  })
  const result = await supabase.rpc("persist_miller_trusted_website_correction_evidence_v1", { p_request: prepared, p_preview: preview })
  if (result.error) throw result.error
  return result.data
}
