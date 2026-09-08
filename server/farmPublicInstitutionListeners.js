import { createHash } from "node:crypto"
import { buildRecommendationLedger, diffRecommendationLedgers } from "./farmRecommendationLedger.js"

const fingerprint = value => createHash("sha256").update(String(value || "")).digest("hex")
const clean = value => String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/\s+/g, " ").trim()
const canonicalUrl = value => { try { const url = new URL(value); if (!/^https?:$/.test(url.protocol)) return ""; url.hash = ""; [...url.searchParams.keys()].filter(key => /^utm_/i.test(key)).forEach(key => url.searchParams.delete(key)); return url.toString() } catch { return "" } }
const NAVIGATION_ONLY = /^(?:French|Reviews|Investigations|About Investigations|Annual Reports|Special Reports|General Report|Public Reports|Publications|\d+|>{1,2}|<{1,2})$/i

export function parsePublicInstitutionIndex(html, { baseUrl, listenerId, include, domain } = {}) {
  const seen = new Set()
  const documents = []
  const canonicalBase = canonicalUrl(baseUrl)
  for (const match of String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url = ""
    try { url = canonicalUrl(new URL(match[1], baseUrl).href) } catch { continue }
    const title = clean(match[2])
    if (!url || !title || url === canonicalBase || NAVIGATION_ONLY.test(title) || /[?&](?:sf_paged|paged|page)=\d+/i.test(url) || !include.test(`${title} ${url}`) || seen.has(url)) continue
    seen.add(url)
    documents.push({
      source_id: `${listenerId}:${fingerprint(url).slice(0, 16)}`,
      title: title.slice(0, 220),
      url,
      primary_domain: domain,
      document_fingerprint: fingerprint(`${url}|${title}`),
      evidence_role: "index_discovered",
      publication_authority: false,
    })
  }
  return documents
}

export function comparePublicInstitutionDocuments(current = [], previous = { documents: [] }) {
  const prior = new Map((previous?.documents || []).map(item => [item.source_id, item]))
  const baseline = !prior.size
  const changed = current.map(item => ({ ...item, change: !prior.has(item.source_id) ? "new_document" : prior.get(item.source_id).document_fingerprint === item.document_fingerprint ? "unchanged" : "updated_document" }))
  return { baseline, documents: changed, new_documents: baseline ? [] : changed.filter(item => item.change === "new_document"), updated_documents: baseline ? [] : changed.filter(item => item.change === "updated_document"), unchanged_documents: baseline ? changed : changed.filter(item => item.change === "unchanged") }
}

export async function runPublicInstitutionIndexListener({ listenerId, url, domain, include, previous = null, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "Miller-Farm-ReadOnly/1.0" } })
  if (!response.ok) throw new Error(`public_institution_index_http_${response.status}`)
  const documents = parsePublicInstitutionIndex(await response.text(), { baseUrl: url, listenerId, include, domain })
  if (!documents.length) throw new Error("public_institution_index_parser_empty")
  const parserMigration = Boolean(previous?.documents?.length) && previous?.parser_version !== 2
  const comparison = comparePublicInstitutionDocuments(documents, parserMigration ? {} : (previous || {}))
  const review = [...comparison.new_documents, ...comparison.updated_documents]
  return {
    checked: documents.length,
    new_documents: review.filter(item => item.change === "new_document").length,
    updated_documents: review.filter(item => item.change === "updated_document").length,
    unchanged_documents: comparison.unchanged_documents.length,
    owner_review: review.length,
    output_titles: review.map(item => item.title),
    memory: { schema_version: "farm-public-institution-index-memory-v1", parser_version: 2, documents },
    domain_counts: { [domain]: { checked: documents.length, changed: review.length } },
    notes: [parserMigration ? "Parser-v2 navigation filtering baseline recorded; presentation-only normalization was not treated as source change." : comparison.baseline ? "Official index baseline recorded; indexed documents were not treated as findings or incidents." : "Index changes require evidence-role, Indigenous-relevance, event-reconciliation and privacy review."],
  }
}

export function runRecommendationLevelBatch({ rows = [], previousLedger = null, title, checkedAt = new Date().toISOString() } = {}) {
  const ledger = buildRecommendationLedger(rows, { title, checkedAt })
  const diff = diffRecommendationLedgers(previousLedger || { recommendations: [] }, ledger)
  const baseline = !previousLedger?.recommendations?.length
  const material = baseline ? [] : [...diff.new_recommendations, ...diff.updated_recommendations]
  return {
    checked: ledger.counts.recommendations,
    new_documents: baseline ? 0 : diff.new_recommendations.length,
    updated_documents: baseline ? 0 : diff.updated_recommendations.length,
    unchanged_documents: baseline ? ledger.counts.recommendations : diff.unchanged_recommendations.length,
    new_events: 0,
    existing_events_strengthened: 0,
    owner_review: material.length,
    publication_safe: 0,
    duplicates_suppressed: 0,
    errors: 0,
    anomaly_quarantine: diff.anomaly_quarantine,
    output_titles: material,
    memory: ledger,
    notes: [baseline ? "Recommendation-level baseline recorded without treating existing rows as new." : "Only material recommendation, response, status, implementation or outcome changes were routed to owner review."],
    publication_authority: false,
    mutation_authority: false,
  }
}

export const PUBLIC_INSTITUTION_LISTENER_CONFIGS = Object.freeze({
  bc_iio_public_reports: { url: "https://iiobc.ca/public-reports/", domain: "policing_custody_corrections", include: /case number|public report|death|serious harm/i },
  alberta_asirt_releases: { url: "https://www.alberta.ca/asirt-news-releases", domain: "policing_custody_corrections", include: /asirt|investigat|finding|report|custody|serious injury|death/i },
  federal_crcc_reports: { url: "https://www.crcc.gc.ca/", domain: "policing_custody_corrections", include: /report|complaint|investigation|systemic|rcmp|decision/i },
  federal_corrections_accountability: { url: "https://oci-bec.gc.ca/en/reports", domain: "policing_custody_corrections", include: /annual report|investigation|indigenous|health|recommend/i },
  bc_child_youth_accountability: { url: "https://rcybc.ca/reports/", domain: "child_welfare_youth_services", include: /report|recommend|progress|investigation|review/i },
  saskatchewan_child_youth_accountability: { url: "https://www.saskadvocate.ca/", domain: "child_welfare_youth_services", include: /report|recommend|investigation|review|annual/i },
})
