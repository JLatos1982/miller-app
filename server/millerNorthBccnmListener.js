import { createHash } from "node:crypto"

export const BCCNM_NOTICE_INDEX = "https://www.bccnm.ca/Public/complaints/Pages/all_notices.aspx"
const NOTICE_BASE = "https://www.bccnm.ca/Public/complaints/Pages/Notice.aspx?NoticeID="
const INDIGENOUS = /\b(indigenous|first nations?|m[ée]tis|inuit)\b/i
const MECHANISM = /\b(emergency|consent|assessment|resuscitat|restraint|security|mental health|cultural safety|discriminat|stereotyp|patient|client|care)\b/i

const decode = value => String(value || "").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
const clean = value => decode(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const hash = value => createHash("sha256").update(String(value)).digest("hex")

export function parseBccnmNoticeIndex(html) {
  const notices = new Map()
  const pattern = /href="\/Public\/complaints\/Pages\/Notice\.aspx\?NoticeID=(\d+)"[^>]*>([^<]+)<\/a>/gi
  for (const match of String(html || "").matchAll(pattern)) {
    const notice_id = Number(match[1])
    if (!notices.has(notice_id)) notices.set(notice_id, { notice_id, practitioner_label: clean(match[2]), url: `${NOTICE_BASE}${notice_id}` })
  }
  return [...notices.values()].sort((a, b) => a.notice_id - b.notice_id)
}

export function selectBccnmNoticesForRange(index = [], { minId = 1, maxId = Number.POSITIVE_INFINITY, limit = 200 } = {}) {
  const boundedLimit = Math.min(500, Math.max(1, Number(limit) || 200))
  return [...index]
    .filter(item => item.notice_id >= minId && item.notice_id <= maxId)
    .sort((a, b) => a.notice_id - b.notice_id)
    .slice(0, boundedLimit)
}

export function parseBccnmNotice(html, { noticeId, url = `${NOTICE_BASE}${noticeId}` } = {}) {
  const source = String(html || "")
  const start = source.indexOf("_DetailsPanel\">")
  const end = source.indexOf("<footer", start)
  const bodyHtml = start >= 0 ? source.slice(start, end > start ? end : undefined) : ""
  const headings = [...bodyHtml.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi)].map(match => clean(match[2]))
  const body_text = clean(bodyHtml)
  const indigenous_relevance_explicit = INDIGENOUS.test(body_text)
  const mechanism_relevance = MECHANISM.test(body_text)
  return {
    notice_id: Number(noticeId),
    url,
    practitioner_label: headings[0] || null,
    outcome_type: headings[1] || null,
    publication_date_text: headings[2] || null,
    body_text,
    document_fingerprint: hash(body_text),
    indigenous_relevance_explicit,
    mechanism_relevance,
    disposition: indigenous_relevance_explicit && mechanism_relevance ? "owner_review" : "not_miller_north_candidate",
  }
}

export function compareBccnmNoticeMemory(previous = {}, current = []) {
  const prior = previous.notices || {}
  const observed = Object.fromEntries(current.map(item => [String(item.notice_id), { document_fingerprint: item.document_fingerprint, url: item.url, checked_at: item.checked_at }]))
  const next = { ...prior, ...observed }
  const new_notices = current.filter(item => !prior[item.notice_id])
  const updated_notices = current.filter(item => prior[item.notice_id] && prior[item.notice_id].document_fingerprint !== item.document_fingerprint)
  return { new_notices, updated_notices, unchanged: current.length - new_notices.length - updated_notices.length, memory: { schema_version: "miller-north-bccnm-listener-memory-v1", notices: next } }
}

export function validateBccnmNoticeResult(item) {
  if (!Number.isInteger(item?.notice_id) || !/^https:\/\/www\.bccnm\.ca\/Public\/complaints\/Pages\/Notice\.aspx\?NoticeID=\d+$/.test(item.url || "") || !/^[a-f0-9]{64}$/.test(item.document_fingerprint || "")) throw new Error("bccnm_notice_result_invalid")
  if (item.disposition === "owner_review" && (!item.indigenous_relevance_explicit || !item.mechanism_relevance)) throw new Error("bccnm_notice_relevance_invalid")
  return true
}
