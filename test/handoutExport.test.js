import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { generateHandoutHtml, sanitizeHandoutFilename } from "../src/handout/handoutExport.js"
import { createInitialHandoutState, handoutReducer } from "../src/handout/handoutState.js"

test("generates a standalone escaped HTML handout", () => {
  let state = createInitialHandoutState()
  state = handoutReducer(state, { type: "update_field", field: "personName", value: "A <Safe> Client" })
  state = handoutReducer(state, { type: "update_field", field: "generalNotes", value: "Call before visiting." })
  state = handoutReducer(state, { type: "add_resource", resource: { id: 4, name: "Helpful Service", website: "https://example.org", phone: "555-0100" } })
  const html = generateHandoutHtml(state)

  assert.match(html, /^<!doctype html>/)
  assert.match(html, /A &lt;Safe&gt; Client/)
  assert.match(html, /Notes \/ suggestions/)
  assert.match(html, /Call before visiting/)
  assert.match(html, /Prepared from the resource finder/)
  assert.match(html, /Helpful Service/)
  assert.match(html, /555-0100/)
  assert.match(html, /https:\/\/example\.org\//)
})

test("handout modules contain no persistence or network save calls", () => {
  const stateSource = fs.readFileSync(new URL("../src/handout/handoutState.js", import.meta.url), "utf8")
  const exportSource = fs.readFileSync(new URL("../src/handout/handoutExport.js", import.meta.url), "utf8")
  const logoSource = fs.readFileSync(new URL("../src/handout/logoUpload.js", import.meta.url), "utf8")
  const combined = `${stateSource}\n${exportSource}\n${logoSource}`

  assert.doesNotMatch(combined, /localStorage|sessionStorage|document\.cookie|supabase|fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/)
})

test("filenames are sanitized", () => {
  const html = generateHandoutHtml(createInitialHandoutState())
  assert.match(html, /Personalized Community Resources/)
  assert.equal(sanitizeHandoutFilename("Burnaby Treatment / Resources!?"), "burnaby-treatment-resources.html")
  assert.equal(sanitizeHandoutFilename("../../"), "resource-handout.html")
})

test("legacy handout data does not break export and obsolete fields are ignored", () => {
  const html = generateHandoutHtml({ fields: { personName: "Sam", subtitle: "Old subtitle", nextSteps: "Old step" }, identity: null, resources: [{ key: "old", name: "Legacy resource" }] })
  assert.match(html, /Sam/)
  assert.match(html, /Legacy resource/)
  assert.doesNotMatch(html, /Old subtitle|Old step/)
})

test("editor exposes only the simplified fields and no temporary-card UI", () => {
  const builder = fs.readFileSync(new URL("../src/handout/HandoutBuilder.jsx", import.meta.url), "utf8")
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  assert.match(builder, /Client name \(optional\)/)
  assert.match(builder, /Notes \/ suggestions \(optional\)/)
  assert.doesNotMatch(builder, /Handout heading|Subtitle \(optional\)|Location or community|Upload|Handout description|Personal note for this resource/)
  assert.doesNotMatch(app, /Create handout card|TemporaryCardEditor|add_temporary_resource/)
  assert.match(app, /resource\.source === "tavily" && !resource\.approved \? null/)
})
