import { createHash } from "node:crypto"
import { canonicalLegalUrl } from "./millerLegalEvidence.js"

const cleanText = value => String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim()
const absolute = (href, base) => { try { return canonicalLegalUrl(new URL(String(href).replace(/&amp;/g, "&"), base).toString().replace(/^http:\/\/www\.courts\.gov\.bc\.ca/i, "https://www.courts.gov.bc.ca")) } catch { return "" } }
const fingerprint = value => createHash("sha256").update(value).digest("hex")

export function parseLegalDecisionIndex(html, { baseUrl, sourceId, include = /decision|judicial|canlii|case/i, titlePattern = null } = {}) {
  const documents = []
  const seen = new Set()
  for (const match of String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absolute(match[1], baseUrl)
    const title = cleanText(match[2])
    if (!url || !title || !include.test(`${title} ${url}`) || (titlePattern && !titlePattern.test(title)) || seen.has(url)) continue
    seen.add(url)
    documents.push({ source_id: `${sourceId}:${fingerprint(url).slice(0, 16)}`, title: title.slice(0, 240), url, document_fingerprint: fingerprint(`${url}|${title}`), event_fingerprint: null, process_role: /judicial review/i.test(`${title} ${url}`) ? "judicial_review" : "owner_review_required" })
  }
  return documents
}

export function compareLegalIndexDocuments(current = [], previous = { documents: [] }) {
  const prior = new Map((previous.documents || []).map(item => [item.source_id, item]))
  const documents = current.map(item => ({ ...item, change: !prior.has(item.source_id) ? "new_document" : prior.get(item.source_id).document_fingerprint === item.document_fingerprint ? "unchanged" : "updated_document" }))
  return { documents, new_documents: documents.filter(item => item.change === "new_document"), updated_documents: documents.filter(item => item.change === "updated_document"), unchanged_documents: documents.filter(item => item.change === "unchanged") }
}

export async function runLegalIndexListener({ listenerId, url, previous, fetchImpl = fetch, include, titlePattern } = {}) {
  const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "Miller-Farm-ReadOnly/1.0" } })
  if (!response.ok) throw new Error(`legal_index_fetch_${response.status}`)
  const documents = parseLegalDecisionIndex(await response.text(), { baseUrl: url, sourceId: listenerId, include, titlePattern })
  if (!documents.length) throw new Error("legal_index_parser_empty")
  const baseline = !Array.isArray(previous?.documents) || previous.documents.length === 0
  const comparison = compareLegalIndexDocuments(documents, previous || {})
  return {
    checked: documents.length,
    new_documents: baseline ? 0 : comparison.new_documents.length,
    updated_documents: baseline ? 0 : comparison.updated_documents.length,
    unchanged_documents: baseline ? documents.length : comparison.unchanged_documents.length,
    owner_review: baseline ? 0 : comparison.new_documents.length + comparison.updated_documents.length,
    output_titles: baseline ? [] : [...comparison.new_documents, ...comparison.updated_documents].map(item => item.title),
    memory: { schema_version: "farm-legal-index-memory-v1", documents: documents.map(item => { const value = { ...item }; delete value.change; return value }) },
    notes: [baseline ? "Initial index baseline recorded without treating existing decisions as new." : "Index changes are legal-document leads only; procedural posture and relevance require review."],
  }
}
