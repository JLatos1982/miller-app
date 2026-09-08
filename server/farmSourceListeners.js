import { createHash } from "node:crypto"

const canonicalUrl = value => {
  try { const url = new URL(value); url.hash = ""; [...url.searchParams.keys()].filter(key => /^utm_/i.test(key)).forEach(key => url.searchParams.delete(key)); return url.toString() } catch { return String(value || "") }
}
const fingerprint = value => createHash("sha256").update(String(value || "")).digest("hex")
const titleFromHtml = html => String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "Public document"
const linksFromHtml = (html, baseUrl, include) => [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(match => {
  try { return { url: canonicalUrl(new URL(match[1], baseUrl).href), title: match[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() } } catch { return null }
}).filter(item => item?.title && include.test(`${item.title} ${item.url}`))

const compareDocuments = (documents, previous) => {
  const prior = new Map((previous?.documents || []).map(item => [item.source_id, item]))
  const baseline = !previous?.documents?.length
  const newDocuments = baseline ? [] : documents.filter(item => !prior.has(item.source_id))
  const updatedDocuments = baseline ? [] : documents.filter(item => prior.has(item.source_id) && prior.get(item.source_id).document_fingerprint !== item.document_fingerprint)
  return { baseline, newDocuments, updatedDocuments, unchanged: documents.length - newDocuments.length - updatedDocuments.length }
}

export async function runFnhoPublicationsListener({ previous = null, fetchImpl = fetch } = {}) {
  const indexes = ["https://fnhoo.ca/annual-reports/", "https://fnhoo.ca/governance/", "https://fnhoo.ca/services/"]
  const documents = []
  for (const index of indexes) {
    const response = await fetchImpl(index, { headers: { "User-Agent": "Miller-Farm-ReadOnly/1.0" }, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`fnho_index_http_${response.status}`)
    const html = await response.text()
    const links = linksFromHtml(html, index, /report|publication|recommend|statement|governance|service|wp-content\/uploads/i)
    const pageTitle = titleFromHtml(html)
    const page = { url: index, title: pageTitle, content_fingerprint: fingerprint(`${pageTitle}|${links.map(link => `${link.title}|${link.url}`).sort().join("|")}`) }
    for (const link of [{ ...page }, ...links]) {
      const sourceId = fingerprint(canonicalUrl(link.url)).slice(0, 20)
      if (documents.some(item => item.source_id === sourceId)) continue
      documents.push({ source_id: sourceId, url: canonicalUrl(link.url), title: link.title, document_fingerprint: link.content_fingerprint || fingerprint(`${link.title}|${canonicalUrl(link.url)}`), source_role: "indigenous_led_accountability", publication_status: "owner_review_required" })
    }
  }
  const change = compareDocuments(documents, previous)
  return { checked: documents.length, new_documents: change.newDocuments.length, updated_documents: change.updatedDocuments.length, unchanged_documents: change.unchanged, owner_review: change.newDocuments.length + change.updatedDocuments.length, output_titles: [...change.newDocuments, ...change.updatedDocuments].map(item => item.title), memory: { schema_version: "farm-fnho-listener-memory-v1", documents }, notes: [change.baseline ? "FNHO Indigenous-led publication baseline recorded; aggregate complaint themes are not converted into incidents." : "Changed FNHO publications require evidence-role and implementation review."] }
}

export async function runExactDocumentListener({ records = [], previous = null, fetchImpl = fetch, now = new Date() } = {}) {
  const documents = []
  for (const record of records) {
    if (record.next_check_due && new Date(record.next_check_due) > new Date(now)) {
      documents.push({ source_id: record.source_id, url: record.url, title: record.title, document_fingerprint: record.expected_fingerprint || "milestone_not_due", milestone_status: "not_due", next_check_due: record.next_check_due })
      continue
    }
    try {
      const response = await fetchImpl(record.url, { headers: { "User-Agent": "Miller-Farm-ReadOnly/1.0" }, signal: AbortSignal.timeout(20_000) })
      if (!response.ok) throw new Error(`http_${response.status}`)
      const body = await response.text()
      const related = linksFromHtml(body, record.url, /verdict|jury findings|recommendation|inquest|critical incident|review|response/i)
      documents.push({ source_id: record.source_id, url: canonicalUrl(record.url), title: record.title, document_fingerprint: fingerprint(body.replace(/\s+/g, " ")), milestone_status: "checked", related_documents: related.slice(0, 20) })
    } catch (error) {
      documents.push({ source_id: record.source_id, url: canonicalUrl(record.url), title: record.title, document_fingerprint: record.expected_fingerprint || "unavailable", milestone_status: "temporarily_unavailable", error_code: String(error.message).replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) })
    }
  }
  const change = compareDocuments(documents, previous)
  const unavailable = documents.filter(item => item.milestone_status === "temporarily_unavailable").length
  return { checked: documents.length, new_documents: change.newDocuments.length, updated_documents: change.updatedDocuments.length, unchanged_documents: change.unchanged, errors: unavailable, owner_review: change.newDocuments.length + change.updatedDocuments.length, output_titles: [...change.newDocuments, ...change.updatedDocuments].map(item => item.title), memory: { schema_version: "farm-exact-document-memory-v1", documents }, notes: [change.baseline ? "Exact-document and milestone baseline recorded." : "A changed source is a review trigger, not a finding or identity determination."] }
}

export function saskatchewanMilestoneRecords() {
  return [
    { source_id: "sk_trevor_charles_notice_2026", title: "Trevor Charles inquest notice", url: "https://www.saskatchewan.ca/government/news-and-media/2026/july/28/inquest-into-the-death-of-trevor-charles", next_check_due: "2026-10-01" },
    { source_id: "sk_vincent_tuckanow_notice_2026", title: "Vincent Lee Tuckanow inquest notice", url: "https://www.saskatchewan.ca/government/news-and-media/2026/august/21/inquest-into-the-death-of-vincent-lee-tuckanow", next_check_due: "2026-09-28" },
    { source_id: "sk_trevor_dubois_sha_2026", title: "Trevor Dubois Saskatchewan Health Authority statement", url: "https://www.saskhealthauthority.ca/news-events/news/update-statement-regarding-patient-death-royal-university-hospital", next_check_due: "2026-10-01" },
  ]
}

export async function runSaskatchewanHumanRightsListener({ previous = null, fetchImpl = fetch } = {}) {
  const indexes = [
    "https://saskatchewanhumanrights.ca/news-events/",
  ]
  const documents = []; const failures = []
  for (const index of indexes) {
    try {
      const response = await fetchImpl(index, { headers: { "User-Agent": "Miller-Farm-ReadOnly/1.0" }, signal: AbortSignal.timeout(20_000) })
      if (!response.ok) throw new Error(`http_${response.status}`)
      const html = await response.text()
      const links = linksFromHtml(html, index, /\b(?:SKHR|SKHRC|SKHRT|human rights|decision|court|appeal|judicial review|settlement|complaint)\b/i)
      for (const link of links) {
        const sourceId = fingerprint(link.url).slice(0, 20)
        if (!documents.some(item => item.source_id === sourceId)) documents.push({ source_id: sourceId, url: link.url, title: link.title, document_fingerprint: fingerprint(`${link.title}|${link.url}`), procedural_stage: "unclassified_owner_review", publication_status: "private_review" })
      }
    } catch (error) { failures.push(`${new URL(index).hostname}:${String(error.message).slice(0, 30)}`) }
  }
  if (!documents.length && failures.length === indexes.length) throw new Error("saskatchewan_human_rights_sources_unavailable")
  const comparablePrevious = previous?.source_set_version === "official-commission-news-v1" ? previous : null
  const change = compareDocuments(documents, comparablePrevious)
  return { checked: documents.length, new_documents: change.newDocuments.length, updated_documents: change.updatedDocuments.length, unchanged_documents: change.unchanged, errors: failures.length, owner_review: change.newDocuments.length + change.updatedDocuments.length, output_titles: [...change.newDocuments, ...change.updatedDocuments].map(item => item.title), memory: { schema_version: "farm-sk-human-rights-memory-v1", source_set_version: "official-commission-news-v1", documents }, notes: [change.baseline ? "Official Commission news baseline recorded; no procedural item is treated as a merits finding. CanLII direct indexes remain disabled after HTTP 403 responses." : "New citations require relevance, privacy and procedural-stage review."] }
}
