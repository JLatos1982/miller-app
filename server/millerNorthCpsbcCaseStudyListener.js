import { createHash } from "node:crypto"

export const CPSBC_CULTURAL_SAFETY_INDEX = "https://www.cpsbc.ca/news/publications/college-connector?keyword=cultural%20safety%20and%20humility"
export const CPSBC_KNOWN_CASE_STUDIES = Object.freeze([
  "https://www.cpsbc.ca/news/publications/college-connector/2024-V12-03/02",
  "https://www.cpsbc.ca/news/publications/college-connector/2024-V12-04/02",
  "https://www.cpsbc.ca/news/publications/college-connector/2024-V12-05/02",
  "https://www.cpsbc.ca/news/publications/college-connector/2025-V13-03/05",
  "https://www.cpsbc.ca/news/publications/college-connector/2025-V13-04/03",
  "https://www.cpsbc.ca/news/publications/college-connector/2025-V13-05/04",
])

const decode = value => String(value || "").replaceAll("&amp;", "&").replaceAll("&#039;", "'").replaceAll("&quot;", '"').replaceAll("&nbsp;", " ")
const clean = value => decode(value).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const canonical = value => new URL(value, "https://www.cpsbc.ca").toString().replace(/\/$/, "")
const fingerprint = value => createHash("sha256").update(value).digest("hex")

export function parseCpsbcCaseStudyIndex(html) {
  const byUrl = new Map()
  for (const article of String(html || "").match(/<article\b[\s\S]*?<\/article>/gi) || []) {
    const href = article.match(/href=["']([^"']*\/news\/publications\/college-connector\/\d{4}-V\d{2}-\d{2}\/\d+)["']/i)?.[1]
    const title = clean(article.match(/field--name-title[\s\S]*?>([\s\S]*?)<\/span>/i)?.[1])
    if (!href || !/^case study:/i.test(title)) continue
    const url = canonical(href)
    byUrl.set(url, { url, title })
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url))
}

export function parseCpsbcCaseStudy(html, seed = {}) {
  const main = String(html || "").match(/<main\b[\s\S]*?<\/main>/i)?.[0] || String(html || "")
  const body_text = clean(main)
  const mechanisms = [
    ["consent", /\bconsent\b/i], ["cultural_safety", /cultural(?:ly)? safe|cultural safety/i],
    ["mental_health", /mental health|suicid/i], ["rural", /\brural\b/i],
    ["emergency", /emergency room|emergency department/i], ["discharge", /discharg/i],
    ["pain", /\bpain\b|analgesi/i], ["reproductive_care", /reproductive|gynecolog|pregnan/i],
  ].filter(([, pattern]) => pattern.test(body_text)).map(([label]) => label)
  const indigenous_relevance_explicit = /\bIndigenous\b|First Nations?|\bM[ée]tis\b|\bInuit\b/i.test(body_text)
  const url = canonical(seed.url)
  return {
    document_id: url,
    url,
    title: seed.title || clean(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || "CPSBC case study",
    source_role: "regulator_case_summary",
    indigenous_relevance_explicit,
    mechanism_tags: mechanisms,
    disposition: indigenous_relevance_explicit && mechanisms.length ? "owner_review" : "not_miller_north_candidate",
    document_fingerprint: fingerprint(body_text),
    body_text,
  }
}

export function compareCpsbcCaseStudyMemory(previous = {}, current = []) {
  const prior = previous.documents || {}
  const documents = Object.fromEntries(current.map(item => [
    item.document_id,
    Object.fromEntries(Object.entries(item).filter(([key]) => key !== "body_text")),
  ]))
  const new_documents = current.filter(item => !prior[item.document_id])
  const amended_documents = current.filter(item => prior[item.document_id] && prior[item.document_id].document_fingerprint !== item.document_fingerprint)
  const unchanged_documents = current.filter(item => prior[item.document_id]?.document_fingerprint === item.document_fingerprint)
  const removed_documents = Object.values(prior).filter(item => !documents[item.document_id])
  return { new_documents, amended_documents, unchanged_documents, removed_documents, memory: { schema_version: "miller-north-cpsbc-case-study-listener-memory-v1", documents } }
}

export function validateCpsbcCaseStudyRecord(record) {
  if (!/^https:\/\/www\.cpsbc\.ca\//.test(record?.url || "") || !/^[a-f0-9]{64}$/.test(record?.document_fingerprint || "") || !record?.title || !Array.isArray(record?.mechanism_tags)) throw new Error("miller_north_cpsbc_case_study_invalid")
  return true
}
