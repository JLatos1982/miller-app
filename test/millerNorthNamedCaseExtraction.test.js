import test from "node:test"
import assert from "node:assert/strict"
import { extractMillerNorthNamedCases } from "../server/millerNorthNamedCaseExtraction.js"
import { normalizeMillerNorthSource } from "../server/millerNorthSourceTextNormalization.js"
const source = (title, excerpt, extra = {}) => extractMillerNorthNamedCases({ title, excerpt, province: "saskatchewan", ...extra })

test("patient, hospital, and encounter produce a strong candidate", () => {
  const [item] = source("Family reports case", "Jane Doe was treated at Regina General Hospital after severe pain. Her family filed a complaint alleging discrimination.")
  assert.equal(item.classification, "named_case_strong"); assert.equal(item.person, "Jane Doe"); assert.equal(item.facility, "Regina General Hospital")
})
test("family narrative can remain partial", () => assert.equal(source("Family account", "Mary Doe said her father had a concrete emergency encounter and was denied care.")[0].classification, "named_case_partial"))
test("bylines, officials, doctors, and researchers are not patients", () => {
  for (const text of ["By Jane Reporter, reporting on systemic racism.", "Health Minister Jane Doe announced a policy.", "Dr. Jane Doe discussed systemic racism.", "Researcher Jane Doe published a study."]) assert.notEqual(source("Context", text)[0].classification, "named_case_strong")
})
test("courts and legal bodies are not patients", () => {
  const [item] = source("Court development", "The Kings Bench reviewed a complaint after a patient was treated at Regina General Hospital.")
  assert.notEqual(item.classification, "named_case_strong")
  assert.equal(item.person, null)
})
test("complaint bodies and commissions are not patients", () => {
  const rows = source("Complaint update", "Emily Kammermayer filed a complaint with the Civilian Review and Complaints Commission after taking her son to La Ronge Health Center.")
  assert.equal(rows.some(item => ["Civilian Review", "Complaints Commission"].includes(item.person)), false)
})
test("date phrases and page headings are not patients", () => {
  for (const text of ["In December, a First Nations patient was treated at Victoria Hospital.", "Our Commitment at Volunteers Hospital lists patient rights."]) {
    assert.equal(source("Page heading", text).some(item => item.classification === "named_case_strong"), false)
  }
})
test("unnamed patient with CEO response is not strong", () => assert.equal(source("CEO response", "Hospital CEO Jane Doe responded after an unnamed patient complaint.")[0].classification, "named_case_partial"))
test("multiple people do not merge", () => {
  const rows = source("Two cases", "Jane Doe was treated at Regina General Hospital after pain. John Smith was removed from Royal University Hospital by security.")
  assert.equal(rows.length >= 2, true); assert.notEqual(rows[0].person, rows[1].person)
})
test("existing case match routes to likely existing", () => {
  const [item] = source("Existing", "Jane Doe was treated at Regina General Hospital after pain.", { existingIncidents: [{ id: "x", working_title: "Jane Doe incident", facility: "Regina General Hospital" }] })
  assert.equal(item.classification, "existing_case_likely")
})
test("facility alone does not make an unrelated patient an existing case", () => {
  const [item] = source("Unrelated", "Anne Fournier was treated at Royal University Hospital after vomiting blood.", { existingIncidents: [{ id: "x", working_title: "Trevor Dubois case", facility: "Royal University Hospital" }] })
  assert.notEqual(item.classification, "existing_case_likely"); assert.notEqual(item.classification, "named_case_strong")
})
test("name plus facility without concrete encounter is partial or context", () => assert.notEqual(source("Mention", "Jane Doe spoke at Regina General Hospital.")[0].classification, "named_case_strong"))
test("pseudonymous social account is not deanonymized", () => { const [item] = source("u/riverstar reports", "u/riverstar describes a hospital experience."); assert.equal(item.person, null) })
test("explicit recent case has timing", () => { const [item] = source("Recent", "Jane Doe died at Royal University Hospital in 2026 after a security encounter."); assert.equal(item.event_year, 2026) })
test("normalized article body supplies evidence-bound facility context", () => {
  const normalizedSource = normalizeMillerNorthSource({ url: "https://example.org/case", trustedDocument: { ok: true, url: "https://example.org/case", text: "<article><p>Jane Doe, a First Nations patient, described an emergency encounter.</p><p>At Regina General Hospital she says she was denied care in 2026.</p></article>" } })
  const [item] = extractMillerNorthNamedCases({ normalizedSource, province: "saskatchewan" })
  assert.equal(item.classification, "named_case_strong")
  assert.equal(item.facility, "Regina General Hospital")
  assert.ok(item.evidence.evidence_span_ids.person)
  assert.ok(item.evidence.evidence_span_ids.facility)
})
test("publisher chrome and photo credits cannot become named cases", () => {
  const rows = source("Article content", "Social Sharing Account Finally. Photo by Greg Southam. Dexter Adams, an Indigenous patient, was treated at Royal Alexandra Hospital.")
  assert.equal(rows.some(item => item.person === "Account Finally" || item.person === "Greg Southam"), false)
  assert.equal(rows.some(item => item.person === "Dexter Adams" && item.classification === "named_case_strong"), true)
})
