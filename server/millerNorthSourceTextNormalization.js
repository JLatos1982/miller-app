import { createHash } from "node:crypto"

export const MILLER_NORTH_SOURCE_NORMALIZATION_VERSION = "miller-north-source-text-normalization-v1"

const clean = (value = "") => String(value).replace(/\s+/g, " ").trim()
const decode = (value = "") => clean(String(value)
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">"))
const hash = value => createHash("sha256").update(value).digest("hex")

function withoutTags(value = "") {
  return decode(String(value)
    .replace(/<\/?(?:script|style|noscript|svg|iframe)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " "))
}

function textFromTag(html, tag) {
  return [...String(html).matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map(match => withoutTags(match[1]))
    .filter(Boolean)
}

function innerFromFirstTag(html, tag) {
  const match = String(html).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match ? match[1] : null
}

function jsonLdValues(html) {
  const values = []
  for (const match of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1])
      const nodes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed]
      for (const node of nodes) if (node && typeof node === "object") values.push(node)
    } catch { /* Invalid publisher JSON-LD is not evidence. */ }
  }
  return values
}

function isNoise(text, label) {
  const value = clean(text).toLowerCase()
  if (!value) return true
  if (["byline", "author_bio", "navigation", "footer", "share", "related"].includes(label)) return true
  return /^(?:by\s+[^.]{1,100}|social sharing\b|article content\b|advertisement\b|story continues below\b|comments?\b|what'?s trending\b|latest stories\b|about (?:us|indiginews)\b|contact us\b|author\b|skip to (?:main )?content|subscribe|sign up|newsletter|share (?:this|article)|related (?:stories|articles)|copyright|all rights reserved|privacy policy|terms (?:of use|and conditions))\b/i.test(value)
}

function evidenceSegment({ url, label, text, position }) {
  const normalized = clean(text)
  return {
    evidence_span_id: `mnse_${hash(`${url}\u001f${label}\u001f${position}\u001f${normalized}`).slice(0, 20)}`,
    structural_label: label,
    text: normalized,
  }
}

function addSegments(segments, url, label, entries) {
  for (const [position, text] of entries.entries()) if (!isNoise(text, label)) segments.push(evidenceSegment({ url, label, text, position }))
}

function htmlSegments(html, url) {
  const stripped = String(html)
    .replace(/<(?:script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|iframe)>/gi, " ")
    .replace(/<(?:nav|footer|aside|form)[^>]*>[\s\S]*?<\/(?:nav|footer|aside|form)>/gi, " ")
  // Prefer publisher article/main containers. Falling back to the page keeps
  // bounded retrieval useful for simpler sites, but never deliberately pulls
  // navigation/footer blocks into the evidence representation.
  const content = innerFromFirstTag(stripped, "article") || innerFromFirstTag(stripped, "main") || stripped
  const segments = []
  addSegments(segments, url, "heading", [...textFromTag(content, "h1"), ...textFromTag(content, "h2"), ...textFromTag(content, "h3")])
  addSegments(segments, url, "paragraph", textFromTag(content, "p"))
  addSegments(segments, url, "blockquote", textFromTag(content, "blockquote"))
  const structured = jsonLdValues(html)
  for (const [index, node] of structured.entries()) {
    if (node.articleBody) addSegments(segments, url, "structured_article_body", [String(node.articleBody)])
    if (node.locationCreated?.name) addSegments(segments, url, "structured_location", [String(node.locationCreated.name)])
    if (node.contentLocation?.name) addSegments(segments, url, "structured_location", [String(node.contentLocation.name)])
    if (node.headline) addSegments(segments, url, "structured_heading", [String(node.headline)])
    // The index is deliberately folded into the label to keep IDs deterministic
    // when two publisher JSON-LD blocks contain the same text.
    if (segments.length && index) segments[segments.length - 1].structured_index = index
  }
  return { segments, structured }
}

function textSegments(text, url) {
  const paragraphs = String(text).split(/\n\s*\n|\r?\n/).map(clean).filter(Boolean)
  const segments = []
  addSegments(segments, url, "paragraph", paragraphs)
  return segments
}

function extractHtmlTitle(html) {
  const match = String(html).match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)
  return match ? withoutTags(match[1]).slice(0, 300) : ""
}

function completeness(segments) {
  const bodyLength = segments.filter(segment => ["paragraph", "blockquote", "structured_article_body"].includes(segment.structural_label)).reduce((total, segment) => total + segment.text.length, 0)
  if (bodyLength >= 320) return "full_bounded_body"
  if (bodyLength >= 60) return "partial_body"
  if (segments.some(segment => segment.structural_label.startsWith("structured_"))) return "structured_only"
  return "metadata_only"
}

export function normalizeMillerNorthSource({ url = "", trustedDocument = null, searchMetadata = {}, sourceOrganization = "" } = {}) {
  const resolvedUrl = clean(trustedDocument?.url || url)
  const raw = String(trustedDocument?.text || "")
  const looksHtml = /<\s*(?:html|body|article|meta|p|script)\b/i.test(raw)
  const parsed = looksHtml ? htmlSegments(raw, resolvedUrl) : { segments: textSegments(raw, resolvedUrl), structured: [] }
  const structuredArticle = parsed.structured.find(node => node.articleBody || node.headline || node.datePublished) || {}
  const title = clean(searchMetadata.title || structuredArticle.headline || extractHtmlTitle(raw) || "")
  const publicationDate = clean(searchMetadata.publication_date || structuredArticle.datePublished || structuredArticle.dateModified || "") || null
  const updateDate = clean(searchMetadata.updated_at || structuredArticle.dateModified || "") || null
  const fallbackExcerpt = clean(searchMetadata.excerpt || searchMetadata.content || "")
  const segments = parsed.segments.length ? parsed.segments : (fallbackExcerpt ? [evidenceSegment({ url: resolvedUrl, label: "search_metadata", text: fallbackExcerpt, position: 0 })] : [])
  const retrievalCompleteness = trustedDocument?.ok === false && !raw ? "metadata_only" : completeness(segments)
  const stable = JSON.stringify({ url: resolvedUrl, title, publicationDate, updateDate, segments: segments.map(({ structural_label, text }) => ({ structural_label, text })) })
  return {
    normalization_version: MILLER_NORTH_SOURCE_NORMALIZATION_VERSION,
    normalized_source_id: `mns_${hash(stable).slice(0, 24)}`,
    source_fingerprint: hash(stable),
    url: resolvedUrl,
    source_organization: clean(sourceOrganization || searchMetadata.source_organization || "") || null,
    title: title || null,
    publication_date: publicationDate,
    updated_date: updateDate,
    retrieval_completeness: retrievalCompleteness,
    evidence_segments: segments,
  }
}

export function caseFocusedEvidenceWindows(normalizedSource, { terms = [], radius = 2 } = {}) {
  const needles = terms.map(value => clean(value).toLowerCase()).filter(Boolean)
  const segments = normalizedSource?.evidence_segments || []
  const indexes = segments.flatMap((segment, index) => needles.some(term => segment.text.toLowerCase().includes(term)) ? [index] : [])
  const selected = new Set(indexes.flatMap(index => Array.from({ length: radius * 2 + 1 }, (_, offset) => index + offset - radius).filter(candidate => candidate >= 0 && candidate < segments.length)))
  return [...selected].sort((a, b) => a - b).map(index => segments[index])
}
