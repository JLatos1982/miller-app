import test from "node:test"
import assert from "node:assert/strict"

import { compareBccnmNoticeMemory, parseBccnmNotice, parseBccnmNoticeIndex, validateBccnmNoticeResult } from "../server/millerNorthBccnmListener.js"

test("BCCNM index parsing yields stable canonical notice identities", () => {
  const records = parseBccnmNoticeIndex('<a href="/Public/complaints/Pages/Notice.aspx?NoticeID=880">Lowe, Katherine</a><a href="/Public/complaints/Pages/Notice.aspx?NoticeID=880">duplicate</a>')
  assert.deepEqual(records, [{ notice_id: 880, practitioner_label: "Lowe, Katherine", url: "https://www.bccnm.ca/Public/complaints/Pages/Notice.aspx?NoticeID=880" }])
})

test("BCCNM body-only classification ignores Indigenous navigation text", () => {
  const navigation = '<nav>Indigenous-specific anti-racism</nav>'
  const unrelated = parseBccnmNotice(`${navigation}<div id="x_DetailsPanel"><h2>A, Nurse</h2><h3>Consent agreement</h3><h3>Jan 1, 2026</h3><p>Documentation breach unrelated to patient care.</p></div><footer>`, { noticeId: 1000 })
  assert.equal(unrelated.indigenous_relevance_explicit, false)
  assert.equal(unrelated.disposition, "not_miller_north_candidate")
  const relevant = parseBccnmNotice(`${navigation}<div id="x_DetailsPanel"><h2>B, Nurse</h2><h3>Consent agreement</h3><h3>Jan 2, 2026</h3><p>An Indigenous client did not provide informed consent for care.</p></div><footer>`, { noticeId: 1001 })
  assert.equal(relevant.disposition, "owner_review")
  assert.equal(validateBccnmNoticeResult(relevant), true)
})

test("BCCNM memory detects new and amended notices without changing identity", () => {
  const first = parseBccnmNotice('<div id="x_DetailsPanel"><h2>B</h2><p>Indigenous client consent care.</p></div><footer>', { noticeId: 1001 })
  const initial = compareBccnmNoticeMemory({}, [{ ...first, checked_at: "2026-09-07" }])
  assert.equal(initial.new_notices.length, 1)
  const replay = compareBccnmNoticeMemory(initial.memory, [{ ...first, checked_at: "2026-09-08" }])
  assert.equal(replay.unchanged, 1)
  const changed = parseBccnmNotice('<div id="x_DetailsPanel"><h2>B</h2><p>Indigenous client consent care. Amended.</p></div><footer>', { noticeId: 1001 })
  assert.equal(compareBccnmNoticeMemory(initial.memory, [{ ...changed, checked_at: "2026-09-08" }]).updated_notices.length, 1)
})
