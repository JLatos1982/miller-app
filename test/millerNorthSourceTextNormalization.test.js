import test from "node:test"
import assert from "node:assert/strict"
import { caseFocusedEvidenceWindows, normalizeMillerNorthSource } from "../server/millerNorthSourceTextNormalization.js"

const url = "https://example.org/story"
const normalize = (text, searchMetadata = {}) => normalizeMillerNorthSource({ url, trustedDocument: { ok: true, url, text }, searchMetadata })

test("removes a byline rather than treating its person as evidence", () => {
  const output = normalize("<article><p>By Jane Reporter</p><p>Patient Mary Doe described an emergency encounter.</p></article>")
  assert.equal(output.evidence_segments.some(segment => /Jane Reporter/.test(segment.text)), false)
  assert.equal(output.evidence_segments.some(segment => /Mary Doe/.test(segment.text)), true)
})
test("removes journalist bios", () => {
  const output = normalize("<article><p>Mary Doe described care.</p></article><footer><p>Jane Reporter is an award-winning journalist.</p></footer>")
  assert.equal(output.evidence_segments.some(segment => /award-winning journalist/.test(segment.text)), false)
})
test("retains a named patient in article body", () => {
  const output = normalize("<article><p>Mary Doe said she was denied treatment.</p></article>")
  assert.match(output.evidence_segments[0].text, /Mary Doe/)
})
test("recovers a facility found deeper in the article", () => {
  const output = normalize("<article><p>Mary Doe described her treatment.</p><p>She was seen at Regina General Hospital after severe pain.</p></article>")
  assert.equal(output.evidence_segments.some(segment => /Regina General Hospital/.test(segment.text)), true)
})
test("case window includes title-adjacent and later encounter paragraphs", () => {
  const output = normalize("<article><h1>Mary Doe seeks answers</h1><p>Background material.</p><p>At Victoria Hospital, Mary Doe says security removed her from the emergency department.</p></article>")
  const window = caseFocusedEvidenceWindows(output, { terms: ["Mary Doe"], radius: 2 })
  assert.equal(window.some(segment => /Victoria Hospital/.test(segment.text)), true)
})
test("multiple people remain in separate source segments", () => {
  const output = normalize("<article><p>Mary Doe was treated at Regina General Hospital.</p><p>John Smith was removed from Royal University Hospital.</p></article>")
  assert.equal(output.evidence_segments.filter(segment => /Mary Doe|John Smith/.test(segment.text)).length, 2)
})
test("rejects facility text confined to a footer", () => {
  const output = normalize("<article><p>Mary Doe described a complaint.</p></article><footer>Regina General Hospital, 123 Main Street</footer>")
  assert.equal(output.evidence_segments.some(segment => /123 Main Street/.test(segment.text)), false)
})
test("retains article body and institutional response", () => {
  const output = normalize("<article><p>Mary Doe said she was denied care at Victoria Hospital.</p><blockquote>The health authority said it is reviewing the complaint.</blockquote></article>")
  assert.equal(output.evidence_segments.some(segment => /denied care/.test(segment.text)), true)
  assert.equal(output.evidence_segments.some(segment => /reviewing the complaint/.test(segment.text)), true)
})
test("metadata-only source is explicitly marked", () => {
  const output = normalize("", { title: "A search title", excerpt: "Short indexed description" })
  assert.equal(output.retrieval_completeness, "metadata_only")
  assert.equal(output.evidence_segments[0].structural_label, "search_metadata")
})
test("retains structured article representations", () => {
  const output = normalize('<script type="application/ld+json">{"@type":"NewsArticle","headline":"Case","articleBody":"Mary Doe was treated at Victoria Hospital.","datePublished":"2026-01-09"}</script>')
  assert.equal(output.retrieval_completeness, "structured_only")
  assert.equal(output.evidence_segments.some(segment => segment.structural_label === "structured_article_body"), true)
  assert.equal(output.publication_date, "2026-01-09")
})
test("repeated normalization is stable", () => {
  const first = normalize("<article><p>Mary Doe was treated at Victoria Hospital.</p></article>")
  const second = normalize("<article><p>Mary Doe was treated at Victoria Hospital.</p></article>")
  assert.equal(first.source_fingerprint, second.source_fingerprint)
  assert.deepEqual(first.evidence_segments, second.evidence_segments)
})
test("evidence spans survive normalization and focused windowing", () => {
  const output = normalize("<article><p>Mary Doe was treated at Victoria Hospital after pain.</p></article>")
  const window = caseFocusedEvidenceWindows(output, { terms: ["Mary Doe"] })
  assert.match(window[0].evidence_span_id, /^mnse_/)
  assert.equal(window[0].evidence_span_id, output.evidence_segments[0].evidence_span_id)
})
