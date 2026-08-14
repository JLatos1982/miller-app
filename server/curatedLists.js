import { createHash } from "node:crypto"

export const LIST_PARSER_VERSION = "miller-counselling-docx-v1.0.0"
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const MAX_DOCX_BYTES = 8 * 1024 * 1024

const decodeXml = (value = "") => String(value).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
const clean = (value = "") => String(value).replace(/[\u200b\ufeff]/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
const sectionPattern = /^(GENERAL COUNSELLING|CHILDREN, YOUTH AND FAMILIES|OLDER ADULT COUNSELLING SERVICES|INDIGENOUS SERVICES|MULTILINGUAL|ADDICTION SUPPORT\/COUNSELLING|HEALTH-RELATED|LGBTQIA2S\+|TRAUMA|GRIEF SUPPORT|CRISIS LINES)$/
const phonePattern = /(?:\+?1[ .-]?)?(?:\(?\d{3}\)?[ .-]?)\d{3}[ .-]?\d{4}(?:\s*(?:ext\.?|x)\s*\d+)?/gi
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const urlPattern = /(?:https?:\/\/|www\.)[^\s,;)]+|\b[a-z0-9-]+\.(?:ca|com|org|net)\/[A-Z0-9_/?&=.%#@+~-]*/gi

export function extractDocxParagraphs(documentXml) {
  return [...String(documentXml).matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((match, index) => {
    const body = match[1]
    const style = body.match(/<w:pStyle w:val="([^"]+)"/)?.[1] || ""
    const text = clean([...body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((item) => decodeXml(item[1])).join(""))
    return { paragraph_number: index + 1, style, text }
  }).filter((item) => item.text)
}

function splitNameAndDescription(text) {
  const normalized = clean(text)
  const divider = normalized.match(/\s(?:–|—|-)+\s|:\s+/)
  if (!divider || divider.index < 2) return { name: normalized.replace(/[.:]$/, ""), description: "" }
  return { name: clean(normalized.slice(0, divider.index)).replace(/[.:]$/, ""), description: clean(normalized.slice(divider.index + divider[0].length)) }
}

function warningCodes(raw, parsed) {
  const warnings = []
  const add = (code, message) => { if (!warnings.some((item) => item.code === code)) warnings.push({ code, message }) }
  if (/\b(?:19|20)\d{2}\b|\bcurrently\b|\bnow\b|reopen|September to April/i.test(raw)) add("time_sensitive", "Contains a date or time-sensitive statement.")
  if (/\$\s?\d|sliding scale|reduced[- ]?rate|subsid/i.test(raw)) add("cost", "Contains price, subsidy, or sliding-scale information.")
  if (/wait\s?list|\d+\s*(?:day|week|month)s?\b/i.test(raw)) add("wait_or_duration", "Contains a wait estimate or program duration.")
  if (/residents? only|residents? of|living in|serving residents|tri-cit|catchment|geographic/i.test(raw)) add("residency", "Contains a geographic or residency restriction.")
  if (/\bages?\b|\d+\+|under \d+|over the age|youth|older adult|seniors?/i.test(raw)) add("age_or_population", "Contains an age or population restriction.")
  if (/sessions? (?:max|maximum|limit)|up to \d+ (?:free )?sessions?|\d+-session/i.test(raw)) add("session_limit", "Contains a session limit.")
  if (/referral|required|physician|family doctor/i.test(raw)) add("referral", "Contains a referral requirement.")
  if (/crisis|suicid|9-8-8|\b988\b|distress or despair/i.test(raw)) add("crisis", "Crisis-related entry requires prominent review and presentation.")
  if (/Email:\s*https?:\/\//i.test(raw)) add("mislabeled_contact", "An Email label appears to contain a website.")
  if (parsed.emails.some((email) => /\.\.|\.$/.test(email)) || /@[A-Z0-9.-]+\.[A-Z]{1}\b/i.test(raw)) add("malformed_email", "Email address may be malformed.")
  if (!parsed.websites.length) add("no_website", "No reliable website was detected.")
  return warnings
}

export function parseCounsellingDocumentXml(documentXml, { filename = "Low cost counselling list.docx" } = {}) {
  const paragraphs = extractDocxParagraphs(documentXml)
  const title = paragraphs[0]?.text || "Imported list"
  const sections = []
  let section = null
  let current = null
  const flush = () => { if (current && section) section.items.push(current); current = null }
  for (const paragraph of paragraphs.slice(1)) {
    if (sectionPattern.test(paragraph.text)) {
      flush(); section = { title: paragraph.text, source_paragraph: paragraph.paragraph_number, items: [] }; sections.push(section); continue
    }
    if (!section) continue
    const isContact = /^(?:Contact|Call|Email|Website|Mental Health Provider List):?/i.test(paragraph.text)
    const isUrlOnly = /^(?:https?:\/\/|www\.)\S+$/i.test(paragraph.text)
    const continuation = current && !isContact && !isUrlOnly && !current.description && current.raw_paragraphs.length === 1
    if (isContact || isUrlOnly || continuation) {
      if (!current) current = { name: "Needs manual identification", description: "", raw_paragraphs: [] }
      current.raw_paragraphs.push(paragraph)
      current.description = clean([current.description, isContact || isUrlOnly ? "" : paragraph.text].filter(Boolean).join(" "))
      continue
    }
    flush()
    const parsed = splitNameAndDescription(paragraph.text)
    current = { ...parsed, raw_paragraphs: [paragraph] }
  }
  flush()
  const allItems = []
  for (const [sectionIndex, currentSection] of sections.entries()) {
    currentSection.display_order = sectionIndex + 1
    currentSection.items = currentSection.items.map((item, itemIndex) => {
      const raw_source_text = item.raw_paragraphs.map((paragraph) => paragraph.text).join("\n")
      const phones = [...new Set(raw_source_text.match(phonePattern) || [])]
      const emails = [...new Set(raw_source_text.match(emailPattern) || [])].map((value) => value.replace(/[.,;]+$/, ""))
      const websites = [...new Set(raw_source_text.match(urlPattern) || [])].map((value) => value.replace(/[.,;]+$/, ""))
      const parsed = { phones, emails, websites }
      const normalized_identity = clean(`${item.name}|${phones[0] || ""}|${websites[0] || ""}`).toLowerCase()
      const result = { local_id: `${sectionIndex + 1}-${itemIndex + 1}`, section_title: currentSection.title, source_paragraph_start: item.raw_paragraphs[0]?.paragraph_number || null, display_order: itemIndex + 1, name: item.name, description: item.description, raw_source_text, phones, emails, websites, warnings: warningCodes(raw_source_text, parsed), normalized_identity, review_status: "pending", final_disposition: "undecided", match_classification: "no_match", proposed_canonical_matches: [] }
      allItems.push(result); return result
    })
  }
  const groups = new Map()
  for (const item of allItems) {
    const key = clean(item.name).toLowerCase().replace(/[^a-z0-9]+/g, " ")
    groups.set(key, [...(groups.get(key) || []), item])
  }
  for (const duplicates of groups.values()) if (duplicates.length > 1) for (const item of duplicates) item.warnings.push({ code: "possible_duplicate", message: `Possible duplicate appears ${duplicates.length} times across the document.` })
  const fingerprint = createHash("sha256").update(documentXml).digest("hex")
  return { parser_version: LIST_PARSER_VERSION, source_filename: filename, source_sha256: fingerprint, title, slug: "low-cost-community-counselling-options", introduction: paragraphs.find((item) => item.paragraph_number > 1 && !sectionPattern.test(item.text))?.text || "", status: "draft", sections, summary: { section_count: sections.length, entry_count: allItems.length, warning_count: allItems.reduce((sum, item) => sum + item.warnings.length, 0), duplicate_entry_count: allItems.filter((item) => item.warnings.some((warning) => warning.code === "possible_duplicate")).length } }
}

export function publicListProjection(list) {
  if (!list || list.status !== "published") return null
  return { id: list.id, slug: list.slug, title: list.title, short_description: list.short_description, introduction: list.introduction, disclaimer: list.disclaimer, category: list.category, last_reviewed_at: list.last_reviewed_at, published_at: list.published_at }
}

export function proposeCanonicalMatches(entry, resources = []) {
  const normalizedName = clean(entry.name).toLowerCase().replace(/[^a-z0-9]+/g, " ")
  const phones = new Set((entry.phones || []).map((value) => value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")))
  const websites = new Set((entry.websites || []).map((value) => { try { const url = new URL(/^https?:/i.test(value) ? value : `https://${value}`); return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase() } catch { return "" } }).filter(Boolean))
  return resources.map((resource) => {
    const candidateName = clean(resource.name || resource.display_name).toLowerCase().replace(/[^a-z0-9]+/g, " ")
    const exactName = normalizedName && normalizedName === candidateName
    const candidatePhone = String(resource.phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")
    let candidateWebsite = ""; try { const url = new URL(resource.website); candidateWebsite = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase() } catch { /* blank */ }
    const exactPhone = Boolean(candidatePhone && phones.has(candidatePhone)), exactWebsite = Boolean(candidateWebsite && websites.has(candidateWebsite))
    const classification = (exactName && (exactPhone || exactWebsite)) ? "confident" : (exactWebsite || exactPhone || exactName) ? "possible" : "no_match"
    return { canonical_resource_id: resource.canonical_resource_id || resource.id, name: resource.name || resource.display_name, classification, evidence: { exact_name: exactName, exact_phone: exactPhone, exact_website: exactWebsite } }
  }).filter((item) => item.classification !== "no_match").slice(0, 10)
}
