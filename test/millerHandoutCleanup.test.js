import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const source = relative => readFileSync(new URL(relative, import.meta.url), "utf8")

test("obsolete custom handout UI is gone while Email Results and pre-made lists remain", () => {
  const app = source("../src/App.jsx")
  const map = source("../src/map/ServiceMap.jsx")
  assert.doesNotMatch(app, /AddToHandoutButton|HandoutBuilder|setIsHandoutOpen|>\s*Handout\s*</)
  assert.doesNotMatch(map, /AddToHandoutButton|dispatchHandout|getResourceKey/)
  assert.match(app, /Email these results/)
  assert.match(app, /<PreMadeLists/)
  assert.equal(existsSync(new URL("../src/handout/HandoutBuilder.jsx", import.meta.url)), false)
})

test("pre-made lists retain their independent print, PDF, and canonical Master List paths", () => {
  const lists = source("../src/lists/PreMadeLists.jsx")
  const master = source("../src/lists/MasterList.jsx")
  assert.match(lists, /Print \/ Save PDF/)
  assert.match(lists, /Download/)
  assert.match(master, /mergeMillerSearchResources/)
  assert.match(master, /miller-practical-supports-public-v1\.json/)
  assert.match(master, /miller-funding-assistance-public-v1\.json/)
})
