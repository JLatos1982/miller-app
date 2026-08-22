import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("Master List exposes only approved visible canonical resources", () => {
  const source = fs.readFileSync(new URL("../src/lists/MasterList.jsx", import.meta.url), "utf8")
  assert.match(source, /normalizedResourceRows\(rawResources\)\.filter\(\(item\) => item\.approved && !item\.hidden\)/)
  assert.match(fs.readFileSync(new URL("../src/lists/PreMadeLists.jsx", import.meta.url), "utf8"), /Master List/)
  assert.match(fs.readFileSync(new URL("../src/lists/PreMadeLists.jsx", import.meta.url), "utf8"), /slug === "master-list"/)
})

test("Master List combines keyword, city, category, clear, and zero-result filtering", () => {
  const source = fs.readFileSync(new URL("../src/lists/MasterList.jsx", import.meta.url), "utf8")
  for (const pattern of [/item\.name/, /item\.city/, /item\.category/, /item\.description/, /item\.population/, /query/, /city/, /category/, /Clear filters/, /No resources match those filters/]) assert.match(source, pattern)
})
