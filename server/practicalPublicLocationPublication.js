import { readFarmSource } from "/Users/admin/samwise-private/server/farmSourceReader.js"
import { extractNumberedAddresses } from "./addressEvidence.js"
import { classifyBcAddressResults, requestBcAddressGeocode } from "./bcAddressGeocoder.js"

export const PRACTICAL_PUBLIC_LOCATION_POLICY_VERSION = "practical_public_location_v1"
export const PRACTICAL_PUBLIC_LOCATION_SOURCE_READER = "samwise_farm_source_reader_v1"

const clean = (value, max = 12_000) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const result = (outcome, extra = {}) => Object.freeze({ outcome, publication_attempted: false, ...extra })
const semanticIdentityTokens = (value) => new Set(clean(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length >= 4 && !/^(?:with|from|health|services|service|british|columbia|result)$/.test(token)))
export function semanticResourceIdentityOverlap(left, right) {
  const a = semanticIdentityTokens(left), b = semanticIdentityTokens(right)
  if (!a.size || !b.size) return 0
  return [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size)
}

function normalizeTrustedSource(source) {
  if (!source?.url) return null
  return {
    url: clean(source.url, 500),
    locality: clean(source.locality, 100),
    title: clean(source.title, 300),
    authority: Number(source.authority),
  }
}

async function resolveTrustedSources({ db, resourceId, source, sources }) {
  // Callers supply this ordered, narrow fallback ladder.  It is intentionally
  // not a discovery mechanism: every URL still goes through Farm's host and
  // redirect protections before it can contribute evidence.
  const supplied = (Array.isArray(sources) ? sources : source ? [source] : []).map(normalizeTrustedSource).filter((item) => item?.url && item.locality)
  if (supplied.length) return supplied

  const query = db.from("resource_source_aliases").select("source_url,source_type,provenance").eq("resource_id", resourceId)
  const { data, error } = await query
  if (error) throw error
  const choices = (data || []).map((item) => ({
    url: clean(item.source_url, 500),
    sourceType: clean(item.source_type, 80),
    locality: clean(item.provenance?.locality || item.provenance?.city, 100),
    title: clean(item.provenance?.title, 300),
    authority: Number(item.provenance?.source_authority),
  })).filter((item) => item.url && item.sourceType !== "tavily_resource" && item.locality)
  return choices.length === 1 ? choices : []
}

function sourceAuthority(source, farm) {
  if (Number.isFinite(source.authority) && source.authority >= 70 && source.authority <= 100) return source.authority
  return farm.source_quality === "authoritative_primary" ? 90 : 75
}

function sourceExcerptForAddress(segments, address) {
  const civic = clean(address).match(/\b\d{1,6}[A-Za-z]?\b/)?.[0]
  return clean((segments || []).find((segment) => civic && new RegExp(`\\b${civic}\\b`, "i").test(segment.text))?.text || "", 1200)
}

function addressContext(pageText, address, radius = 900) {
  const civic = clean(address).match(/\b\d{1,6}[A-Za-z]?\b/)?.[0]
  const at = civic ? String(pageText).search(new RegExp(`\\b${civic}\\b`, "i")) : -1
  return at < 0 ? "" : clean(String(pageText).slice(Math.max(0, at - radius), at + radius), 2_400)
}

function programIdentityPhrases(displayName) {
  // A location belongs to the named program, not merely to its parent agency
  // or a hospital mentioned in the resource title.  The leading title segment
  // is normally the durable program name (for example, "Road to Recovery" in
  // "Road to Recovery - St. Paul's Hospital").
  const name = clean(displayName, 300)
  const leading = clean(name.split(/\s+[-\u2012-\u2015]\s+/)[0], 200)
  const beforePipe = clean(leading.split(/\s*\|\s*/)[0], 200)
  const withoutParenthetical = clean(name.replace(/\s*\([^)]*\)/g, ""), 200)
  const concise = clean(withoutParenthetical.replace(/\s+(?:counselling\s+clinic|treatment\s+centre|clinic)$/i, ""), 200)
  const regionalAlias = clean(beforePipe.replace(/\s+on\s+vancouver\s+island$/i, ""), 200)
  return [...new Set([leading, beforePipe, regionalAlias, name, withoutParenthetical, concise].map((phrase) => phrase.toLowerCase()).filter((phrase) => phrase.split(/\s+/).length >= 2 && phrase.length >= 7))]
}

const phrasePattern = (phrase) => new RegExp(`\\b${phrase.split(/\\s+/).map((part) => part.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("\\s+")}\\b`, "i")
const phraseAppears = (value, phrases) => phrases.some((phrase) => phrasePattern(phrase).test(String(value || "")))
const addressAppears = (value, address) => {
  const haystack = clean(value, 12_000).toLowerCase()
  const tokens = clean(address, 600).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length >= 2)
  const civic = tokens.find((token) => /^\d{1,6}[a-z]?$/.test(token))
  const street = tokens.filter((token) => !/^\d/.test(token) && !/^(?:bc|street|st|road|rd|avenue|ave|drive|dr|boulevard|blvd|highway|hwy|unit|suite)$/.test(token)).slice(0, 2)
  return Boolean(civic && haystack.includes(civic) && street.length && street.every((token) => haystack.includes(token)))
}

function structuralLinkage({ structure, address, phrases }) {
  const blocks = (structure || []).filter((block) => addressAppears(`${block.heading || ""} ${block.text || ""}`, address))
  const contradictory = blocks.some((block) => /\b(?:corporate|administrative|head|agency)\s+(?:office|address|headquarters)\b|\bglobal\s+footer\b|\bprivacy policy\b|\ball rights reserved\b|\bdoes not provide direct patient care\b/i.test(`${block.heading || ""} ${block.text || ""} ${block.attributes || ""}`))
  if (contradictory) return { supported: false, reason: "global_footer_or_admin", blocks }
  const linked = blocks.find((block) => {
    const headingMatch = phraseAppears(block.heading, phrases)
    const bodyMatch = phraseAppears(block.text, phrases)
    if (block.kind === "heading_section") return headingMatch
    if (block.kind === "json_ld_location") return headingMatch
    if (!/^(?:section_block|article_block|address_block|li_block|div_block)$/.test(block.kind || "")) return false
    return headingMatch || (clean(block.text, 6000).length <= 1600 && bodyMatch)
  })
  if (!linked) return { supported: false, reason: blocks.length ? "structured_location_not_recognized" : "insufficient_context", blocks }
  return { supported: true, reason: linked.kind === "json_ld_location" ? "structured_location_recognized" : "same_structural_block", block: linked, blocks }
}

function proximityDiagnostic(sourceText, address, phrases) {
  const text = String(sourceText || "").toLowerCase()
  const civic = clean(address).match(/\b\d{1,6}[A-Za-z]?\b/)?.[0]
  const at = civic ? text.search(new RegExp(`\\b${civic}\\b`, "i")) : -1
  if (at < 0) return { reason: "insufficient_context", distance: null, direction: null }
  const occurrences = []
  for (const phrase of phrases) {
    const matcher = new RegExp(phrasePattern(phrase).source, "ig")
    let match
    while ((match = matcher.exec(text)) !== null) occurrences.push(match.index)
  }
  if (!occurrences.length) return { reason: "insufficient_context", distance: null, direction: null }
  const nearest = occurrences.sort((left, right) => Math.abs(left - at) - Math.abs(right - at))[0]
  const distance = Math.abs(nearest - at), direction = nearest <= at ? "before" : "after"
  if (direction === "after") return { reason: "title_after_address", distance, direction }
  if (distance > 350) return { reason: "title_distance_only", distance, direction }
  return { reason: "insufficient_context", distance, direction }
}

function isStructuredServiceRecord(sourceUrl, sourceText, phrases) {
  // BC 211's /result/ pages are one service record: their bounded reader
  // chunks can split the service heading from its contact card by more than
  // 350 characters.  This is stronger than proximity alone, but deliberately
  // excludes agency-detail pages that list many unrelated services.
  let url
  try { url = new URL(sourceUrl) } catch { return false }
  if (!/(^|\.)bc\.211\.ca$/i.test(url.hostname) || !/^\/result\//i.test(url.pathname)) return false
  const text = String(sourceText || "").toLowerCase()
  return phrases.some((phrase) => text.includes(phrase))
}

function isBc211AgencyDetail(sourceUrl) {
  try { const url = new URL(sourceUrl); return /(^|\.)bc\.211\.ca$/i.test(url.hostname) && /^\/agency-details\//i.test(url.pathname) } catch { return false }
}

function phraseOccursNearAddress(context, address, phrases) {
  const civic = clean(address).match(/\b\d{1,6}[A-Za-z]?\b/)?.[0]
  const at = civic ? context.search(new RegExp(`\\b${civic}\\b`, "i")) : -1
  if (at < 0) return false
  return phrases.some((phrase) => {
    const pattern = phrase.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")
    const matcher = new RegExp(`\\b${pattern}\\b`, "ig")
    let match
    while ((match = matcher.exec(context)) !== null) {
      // A program heading or program-specific location block must lead into
      // its address.  A program title that appears later in a page's service
      // index does not validate the preceding agency office address.
      if (match.index <= at && at - match.index <= 350) return true
    }
    return false
  })
}

function addressLocalContext(context, address) {
  const civic = clean(address).match(/\b\d{1,6}[A-Za-z]?\b/)?.[0]
  const at = civic ? context.search(new RegExp(`\\b${civic}\\b`, "i")) : -1
  if (at < 0) return ""
  const prior = Math.max(context.lastIndexOf(".", at - 1), context.lastIndexOf("\n", at - 1))
  const nextPeriod = context.indexOf(".", at)
  const nextLine = context.indexOf("\n", at)
  const next = [nextPeriod, nextLine].filter((position) => position >= 0).sort((a, b) => a - b)[0]
  return context.slice(prior + 1, next === undefined ? at + 220 : next + 1)
}

// This does not infer a location.  It classifies only addresses extracted from
// the already trusted source, using the bounded local context around each one.
export function evaluatePracticalLocationCandidates({ resource, sourceText, candidates, sourceUrl = "", structure = [] }) {
  const phrases = programIdentityPhrases(resource.display_name)
  const structuredServiceRecord = isStructuredServiceRecord(sourceUrl, sourceText, phrases)
  const agencyDetail = isBc211AgencyDetail(sourceUrl)
  return (candidates || []).map((address, index) => {
    const context = addressContext(sourceText, address, 450)
    const localContext = addressLocalContext(context, address)
    const civic = clean(address).match(/\b\d{1,6}[A-Za-z]?\b/)?.[0] || ""
    const explicitPhysicalAddress = civic && new RegExp(`\\baddress\\b[\\s\\S]{0,240}\\b${civic}\\b`, "i").test(localContext)
    const mailingOnly = /\bmailing\s+address\b/i.test(localContext) && !explicitPhysicalAddress
    const administrativeNoise = /\b(?:corporate|administrative|head|main|agency)\s+(?:office|address|headquarters)\b|\bfooter\b/i.test(localContext) || mailingOnly
    const proximitySupported = Boolean(!administrativeNoise && context && phraseOccursNearAddress(context, address, phrases))
    const structural = structuralLinkage({ structure, address, phrases })
    const structuralContradiction = structural.reason === "global_footer_or_admin"
    const supported = Boolean(!agencyDetail && !administrativeNoise && (structuredServiceRecord || (!structuralContradiction && (proximitySupported || structural.supported))))
    const diagnostic = agencyDetail ? { reason: "multi_site_without_program_binding", distance: null, direction: null }
      : administrativeNoise ? { reason: "global_footer_or_admin", distance: null, direction: null }
      : structuredServiceRecord && !proximitySupported ? { reason: "reader_chunk_boundary", distance: null, direction: null }
      : structuralContradiction ? { reason: "global_footer_or_admin", distance: null, direction: null }
      : structural.supported && !proximitySupported ? { reason: structural.reason, distance: null, direction: null }
      : proximitySupported ? { reason: "proximity_supported", distance: 0, direction: "before" }
      : proximityDiagnostic(sourceText, address, phrases)
    return Object.freeze({ address, context, extraction_method: structural.supported ? `trusted_source_${structural.block.kind}_v2` : "trusted_source_civic_context_v1", program_site_disposition: supported ? "program_site_supported" : "site_context_unknown", current_rule_supported: proximitySupported || structuredServiceRecord, structural_linkage_supported: structural.supported, linkage_reason: diagnostic.reason, title_distance: diagnostic.distance, title_direction: diagnostic.direction, structural_context: structural.block ? { structure_id: structural.block.structure_id, kind: structural.block.kind, heading: structural.block.heading, text: clean(structural.block.text, 1600), attributes: structural.block.attributes } : null, order: index })
  })
}

function extractedCandidates(farm, sourceText) {
  return [...new Set(extractNumberedAddresses([sourceText, ...(farm.structure || []).map((block) => `${block.heading || ""} ${block.text || ""}`)].join("\n")))]
}

function geocoderPackage(best) {
  return Object.freeze({
    provider: best.provider,
    standardized_address: best.returned_address,
    returned_address: best.returned_address,
    locality: best.locality,
    score: best.score,
    precision: best.precision,
    precision_points: best.precision_points,
    location_descriptor: best.location_descriptor,
    site_id: best.site_id,
    municipality_match: best.municipality_match,
    province_match: best.province_match,
    civic_number_match: best.civic_number_match,
    street_match: best.street_match,
    valid_coordinate: best.valid_coordinate,
    materially_faulted: best.materially_faulted,
    result_count: best.result_count,
    candidate_identity_clear: best.candidate_identity_clear,
    materially_competing_candidate: best.materially_competing_candidate,
    coordinates: { latitude: best.latitude, longitude: best.longitude },
  })
}

// This helper is used from trusted application code only. It starts from a
// resource UUID, reads a permitted source through Samwise, reuses Miller's
// civic extraction, asks the BC geocoder, preflights, and finally publishes.
export async function publishPracticalPublicLocation({
  db,
  resourceId,
  source,
  sources,
  candidateAddress = "",
  multiLocationSupported = false,
  actorId = null,
  readSource = readFarmSource,
  geocode = requestBcAddressGeocode,
} = {}) {
  if (!db || !uuid(resourceId)) throw new Error("practical_public_location_resource_invalid")

  const resourceResult = await db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("id", resourceId).maybeSingle()
  if (resourceResult.error) throw resourceResult.error
  const resource = resourceResult.data
  if (!resource || resource.lifecycle_state !== "active" || resource.editorial_status === "hidden") return result("resource_ineligible")

  const trustedSources = await resolveTrustedSources({ db, resourceId, source, sources })
  if (!trustedSources.length) return result("trusted_source_or_locality_missing")

  const attempts = []
  let last = result("trusted_source_or_locality_missing")
  for (const [index, trustedSource] of trustedSources.entries()) {
    let farm
    try {
      farm = await readSource({ url: trustedSource.url })
    } catch (error) {
      // An inaccessible official page is not evidence that the service lacks
      // a public address.  Keep an auditable result and advance only to the
      // caller-supplied next trusted source.
      const message = clean(error?.message, 300)
      const unavailable = /farm_source_(?:unavailable|empty|content_type|too_large)|fetch failed|ENOTFOUND|ECONN|timeout/i.test(message)
      last = result(unavailable ? "official_source_unavailable" : "trusted_source_rejected", { source_url: trustedSource.url, source_error: message })
      attempts.push({ source_url: trustedSource.url, outcome: last.outcome })
      continue
    }
    if (!farm || !["authoritative_primary", "credible_primary"].includes(farm.source_quality)) {
      last = result("trusted_source_not_approved", { source_url: trustedSource.url })
      attempts.push({ source_url: trustedSource.url, outcome: last.outcome })
      continue
    }

    const sourceText = (farm.segments || []).map((segment) => segment.text).join("\n")
    const candidates = extractedCandidates(farm, sourceText)
    const requestedAddress = clean(candidateAddress, 600)
    const canonicalAddress = requestedAddress ? candidates.find((address) => address === requestedAddress) : candidates.length === 1 ? candidates[0] : ""
    if (!canonicalAddress) {
      last = result(candidates.length ? "ambiguous_civic_address" : "civic_address_missing", { source_url: farm.url })
      attempts.push({ source_url: trustedSource.url, outcome: last.outcome })
      continue
    }
    const evaluated = evaluatePracticalLocationCandidates({ resource, sourceText, candidates: [canonicalAddress], sourceUrl: farm.url, structure: farm.structure })[0]
    const sourceExcerpt = sourceExcerptForAddress(farm.segments, canonicalAddress) || clean(evaluated.structural_context?.text, 1200)
    if (!sourceExcerpt || evaluated.program_site_disposition !== "program_site_supported") {
      last = result("program_site_not_confirmed", { source_url: farm.url })
      attempts.push({ source_url: trustedSource.url, outcome: last.outcome })
      continue
    }

    const geocodeResponse = await geocode({ street_address: canonicalAddress, city: trustedSource.locality })
    if (!geocodeResponse?.ok) {
      last = result(`geocoder_${geocodeResponse?.status || "unavailable"}`, { source_url: farm.url })
      attempts.push({ source_url: trustedSource.url, outcome: last.outcome })
      continue
    }
    const classified = classifyBcAddressResults(geocodeResponse.features, { street_address: canonicalAddress, city: trustedSource.locality })
    if (!['exact_civic', 'practical_high_confidence'].includes(classified.classification) || !classified.best) {
      last = result(`geocoder_${classified.classification}`, { source_url: farm.url })
      attempts.push({ source_url: trustedSource.url, outcome: last.outcome })
      continue
    }

    const packageForPublication = Object.freeze({
    canonical_address: canonicalAddress,
    locality: trustedSource.locality,
    source_url: farm.url,
    source_title: trustedSource.title || `${new URL(farm.url).hostname} public listing`,
    source_excerpt: sourceExcerpt,
    source_fingerprint: farm.fingerprint,
    source_reader: PRACTICAL_PUBLIC_LOCATION_SOURCE_READER,
    source_quality: farm.source_quality,
    source_authority: sourceAuthority(trustedSource, farm),
    policy_version: PRACTICAL_PUBLIC_LOCATION_POLICY_VERSION,
    multi_location_supported: multiLocationSupported === true,
    geocoder: { ...geocoderPackage(classified.best), candidate_identity_clear: classified.candidate_identity_clear === true, materially_competing_candidate: classified.materially_competing_candidate === true },
  })

    const preflight = await db.rpc("preflight_public_location_v1", { p_resource_id: resourceId, p_package: packageForPublication })
    if (preflight.error) throw preflight.error
    if (preflight.data?.status !== "eligible_publicly_listed_location") {
      last = result("preflight_rejected", { preflight: preflight.data || null, package: packageForPublication })
      attempts.push({ source_url: trustedSource.url, outcome: last.outcome })
      continue
    }

    const published = await db.rpc("publish_practical_public_location_v1", { p_resource_id: resourceId, p_package: packageForPublication, p_actor_id: actorId })
    if (published.error) throw published.error
    attempts.push({ source_url: trustedSource.url, outcome: published.data?.status || "published" })
    return Object.freeze({ outcome: published.data?.status || "published", publication_attempted: true, preflight: preflight.data, publication: published.data, package: packageForPublication, attempts, fallback_used: index > 0 })
  }
  return Object.freeze({ ...last, attempts, fallback_used: false })
}

// Evaluate every explicitly supported civic candidate from one trusted page.
// Each candidate is then independently routed through the existing helper,
// geocoder, preflight, receipt, and publication path.
export async function publishPracticalPublicLocations({ db, resourceId, source, actorId = null, readSource = readFarmSource, geocode = requestBcAddressGeocode } = {}) {
  if (!db || !uuid(resourceId) || !source?.url || !source?.locality) throw new Error("practical_public_location_resource_invalid")
  const resourceResult = await db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("id", resourceId).maybeSingle()
  if (resourceResult.error) throw resourceResult.error
  if (!resourceResult.data || resourceResult.data.lifecycle_state !== "active" || resourceResult.data.editorial_status === "hidden") return result("resource_ineligible")
  let farm
  try { farm = await readSource({ url: source.url }) } catch (error) { return result("official_source_unavailable", { source_error: clean(error?.message, 300) }) }
  if (!farm || !["authoritative_primary", "credible_primary"].includes(farm.source_quality)) return result("trusted_source_not_approved")
  const sourceText = (farm.segments || []).map((segment) => segment.text).join("\n")
  const candidates = extractedCandidates(farm, sourceText)
  const evaluated = evaluatePracticalLocationCandidates({ resource: resourceResult.data, sourceText, candidates, sourceUrl: farm.url, structure: farm.structure })
  const supported = evaluated.filter((candidate) => candidate.program_site_disposition === "program_site_supported")
  if (!supported.length) return result(candidates.length ? "multi_site_ambiguous" : "civic_address_missing", { candidates: evaluated })
  const multiLocationSupported = supported.length > 1
  const publications = []
  for (const candidate of supported) publications.push(await publishPracticalPublicLocation({ db, resourceId, source, actorId, readSource, geocode, candidateAddress: candidate.address, multiLocationSupported }))
  return Object.freeze({ outcome: multiLocationSupported ? "multi_location_supported" : "single_location_supported", publication_attempted: publications.some((item) => item.publication_attempted), candidates: evaluated, publications })
}
