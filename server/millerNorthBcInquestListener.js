import { createHash } from "node:crypto"

export const BC_INQUEST_INDEX = "https://www2.gov.bc.ca/gov/content/life-events/death/coroners-service/inquest-schedule-jury-findings-verdicts"

const clean = value => String(value || "")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim()

const absolute = value => new URL(value, "https://www2.gov.bc.ca").href
const verdictPattern = /href="([^"]+\/(?:inquest\/)?(?:19|20)\d{2}\/[^"?#]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi

export function parseBcInquestIndex(html) {
  const records = new Map()
  for (const rowMatch of String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1]
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1])
    if (cells.length < 5) continue
    const name = clean(cells[2])
    const inquest_type = clean(cells[3]) || null
    const inquest_date_text = clean(cells[0]) || null
    const location = clean(cells[1]) || null
    for (const link of cells[4].matchAll(verdictPattern)) {
      const url = absolute(link[1])
      const document_id = url.toLowerCase()
      if (!records.has(document_id)) {
        const year = Number(url.match(/\/(20\d{2})\//)?.[1]) || null
        records.set(document_id, {
          document_id,
          url,
          title: clean(link[2]) || "Inquest verdict",
          person_or_event: name || null,
          inquest_date_text,
          location,
          inquest_type,
          year,
          source_role: "jury_verdict",
        })
      }
    }
  }
  return [...records.values()].sort((a, b) => a.url.localeCompare(b.url))
}

export function fingerprintBcInquestDocument(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

export function compareBcInquestMemory(previous = {}, current = []) {
  const prior = previous.documents || {}
  const documents = Object.fromEntries(current.map(item => [item.document_id, {
    url: item.url,
    person_or_event: item.person_or_event,
    year: item.year,
    document_fingerprint: item.document_fingerprint,
    checked_at: item.checked_at,
  }]))
  const new_documents = current.filter(item => !prior[item.document_id])
  const amended_documents = current.filter(item => prior[item.document_id] && prior[item.document_id].document_fingerprint !== item.document_fingerprint)
  const unchanged_documents = current.filter(item => prior[item.document_id]?.document_fingerprint === item.document_fingerprint)
  const removed_documents = Object.keys(prior).filter(id => !documents[id]).map(id => prior[id])
  return {
    new_documents,
    amended_documents,
    unchanged_documents,
    removed_documents,
    memory: { schema_version: "miller-north-bc-inquest-listener-memory-v1", documents },
  }
}

export function validateBcInquestRecord(record) {
  if (!record?.document_id || !/^https:\/\/www2\.gov\.bc\.ca\/assets\/gov\/.+\.pdf$/i.test(record.url || "")) throw new Error("bc_inquest_record_invalid")
  if (!/^[a-f0-9]{64}$/.test(record.document_fingerprint || "")) throw new Error("bc_inquest_fingerprint_invalid")
  if (record.source_role !== "jury_verdict") throw new Error("bc_inquest_source_role_invalid")
  return true
}
