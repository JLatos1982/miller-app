import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { generateHandoutHtml } from "../src/handout/handoutExport.js"
import { createInitialHandoutState, handoutReducer } from "../src/handout/handoutState.js"

test("generates a standalone escaped HTML handout", () => {
  let state = createInitialHandoutState()
  state = handoutReducer(state, { type: "update_field", field: "title", value: "A <Safe> Handout" })
  state = handoutReducer(state, { type: "add_resource", resource: { id: 4, name: "Helpful Service", website: "https://example.org", phone: "555-0100" } })
  const html = generateHandoutHtml(state)

  assert.match(html, /^<!doctype html>/)
  assert.match(html, /A &lt;Safe&gt; Handout/)
  assert.match(html, /Helpful Service/)
  assert.match(html, /555-0100/)
  assert.match(html, /https:\/\/example\.org\//)
})

test("handout modules contain no persistence or network save calls", () => {
  const stateSource = fs.readFileSync(new URL("../src/handout/handoutState.js", import.meta.url), "utf8")
  const exportSource = fs.readFileSync(new URL("../src/handout/handoutExport.js", import.meta.url), "utf8")
  const combined = `${stateSource}\n${exportSource}`

  assert.doesNotMatch(combined, /localStorage|sessionStorage|document\.cookie|supabase|fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/)
})

