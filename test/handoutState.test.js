import test from "node:test"
import assert from "node:assert/strict"
import { createInitialHandoutState, handoutReducer } from "../src/handout/handoutState.js"

const firstResource = { id: 1, name: "First Resource", description: "Original description" }
const secondResource = { id: 2, name: "Second Resource" }

test("adds a resource and prevents duplicate additions", () => {
  let state = createInitialHandoutState()
  state = handoutReducer(state, { type: "add_resource", resource: firstResource })
  state = handoutReducer(state, { type: "add_resource", resource: firstResource })
  assert.equal(state.resources.length, 1)
  assert.equal(state.resources[0].name, "First Resource")
})

test("removes and clears handout resources", () => {
  let state = createInitialHandoutState()
  state = handoutReducer(state, { type: "add_resource", resource: firstResource })
  state = handoutReducer(state, { type: "remove_resource", key: "id:1" })
  assert.equal(state.resources.length, 0)

  state = handoutReducer(state, { type: "add_resource", resource: firstResource })
  state = handoutReducer(state, { type: "update_field", field: "title", value: "Changed" })
  state = handoutReducer(state, { type: "clear" })
  assert.equal(state.resources.length, 0)
  assert.equal(state.fields.title, "My Resource Handout")
})

test("reorders selected resources", () => {
  let state = createInitialHandoutState()
  state = handoutReducer(state, { type: "add_resource", resource: firstResource })
  state = handoutReducer(state, { type: "add_resource", resource: secondResource })
  state = handoutReducer(state, { type: "move_resource", key: "id:2", direction: -1 })
  assert.deepEqual(state.resources.map((resource) => resource.name), ["Second Resource", "First Resource"])
})

test("edits handout fields and resource-only text without changing source data", () => {
  let state = createInitialHandoutState()
  state = handoutReducer(state, { type: "add_resource", resource: firstResource })
  state = handoutReducer(state, { type: "update_field", field: "nextSteps", value: "Call tomorrow" })
  state = handoutReducer(state, { type: "update_resource", key: "id:1", field: "handoutNote", value: "Bring ID" })
  state = handoutReducer(state, { type: "update_resource", key: "id:1", field: "handoutDescription", value: "Short description" })

  assert.equal(state.fields.nextSteps, "Call tomorrow")
  assert.equal(state.resources[0].handoutNote, "Bring ID")
  assert.equal(firstResource.description, "Original description")

  state = handoutReducer(state, { type: "restore_description", key: "id:1" })
  assert.equal(state.resources[0].handoutDescription, "Original description")
})

test("selected-resource count follows reducer state", () => {
  let state = createInitialHandoutState()
  assert.equal(state.resources.length, 0)
  state = handoutReducer(state, { type: "add_resource", resource: firstResource })
  state = handoutReducer(state, { type: "add_resource", resource: secondResource })
  assert.equal(state.resources.length, 2)
})

