import test from "node:test"
import assert from "node:assert/strict"
import {
  buildTemporaryCardPayload,
  createManualTemporaryDraft,
  createTemporaryResource,
  isEligibleExternalResult,
} from "../src/handout/temporaryCard.js"
import { createInitialHandoutState, handoutReducer } from "../src/handout/handoutState.js"

const external = { source: "tavily", approved: false, name: "Public Clinic", website: "https://example.org/help", description: "Public withdrawal and counselling information.", city: "Vernon" }

test("only useful unapproved external results are eligible", () => {
  assert.equal(isEligibleExternalResult(external), true)
  assert.equal(isEligibleExternalResult({ ...external, approved: true }), false)
  assert.equal(isEligibleExternalResult({ ...external, hidden: true }), false)
  assert.equal(isEligibleExternalResult({ ...external, website: "" }), false)
  assert.equal(isEligibleExternalResult({ ...external, source: "miller" }), false)
})

test("AI request payload allow-lists public result fields and excludes personalized data", () => {
  const payload = buildTemporaryCardPayload({ ...external, personName: "Private Person", handoutNote: "Private note", generalNotes: "Private" })
  assert.deepEqual(Object.keys(payload), ["sourceTitle", "sourceUrl", "name", "organization", "description", "website", "city", "category", "serviceType"])
  assert.doesNotMatch(JSON.stringify(payload), /Private Person|Private note|generalNotes/)
})

test("manual fallback creates an editable source-based draft", () => {
  const draft = createManualTemporaryDraft(external)
  assert.equal(draft.name, "Public Clinic")
  assert.equal(draft.website, "https://example.org/help")
  assert.equal(draft.serviceArea, "Vernon")
})

test("temporary cards use stable client IDs and prevent duplicate source additions", () => {
  const card = createTemporaryResource(createManualTemporaryDraft(external), external, { clientId: "client-1", retrievedAt: "2026-07-18T00:00:00.000Z", aiAssisted: true })
  assert.equal(card.key, "temporary:client-1")
  assert.equal(card.type, "temporary-resource")
  assert.equal(card.verificationStatus, "unconfirmed")

  let state = createInitialHandoutState()
  state = handoutReducer(state, { type: "add_temporary_resource", resource: card })
  state = handoutReducer(state, { type: "add_temporary_resource", resource: { ...card, key: "temporary:client-2", clientId: "client-2" } })
  assert.equal(state.resources.length, 1)
  assert.equal(isEligibleExternalResult(external, state.resources), false)
})

test("temporary cards can be edited, reordered, and removed without changing source data", () => {
  const card = createTemporaryResource(createManualTemporaryDraft(external), external, { clientId: "client-1" })
  let state = createInitialHandoutState()
  state = handoutReducer(state, { type: "add_resource", resource: { id: 1, name: "Approved" } })
  state = handoutReducer(state, { type: "add_temporary_resource", resource: card })
  state = handoutReducer(state, { type: "update_resource", key: card.key, field: "hours", value: "Call first" })
  state = handoutReducer(state, { type: "update_resource", key: card.key, field: "showVerificationNote", value: false })
  state = handoutReducer(state, { type: "move_resource", key: card.key, direction: -1 })
  assert.equal(state.resources[0].hours, "Call first")
  assert.equal(state.resources[0].showVerificationNote, false)
  assert.equal(external.hours, undefined)
  state = handoutReducer(state, { type: "remove_resource", key: card.key })
  assert.equal(state.resources.length, 1)
})
