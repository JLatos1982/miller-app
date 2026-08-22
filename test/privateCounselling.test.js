import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("private counselling is a secondary mailto-only accessible modal", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const css = fs.readFileSync(new URL("../src/App.css", import.meta.url), "utf8")
  const modal = fs.readFileSync(new URL("../src/site/AccessibleModal.jsx", import.meta.url), "utf8")
  assert.match(app, /Private Counselling/)
  assert.match(app, /Justin Latos, MSc, CCC/)
  assert.doesNotMatch(app, /Justin Latos, MA, CCC/)
  assert.match(app, /handout-toolbar-controls/)
  assert.match(css, /\.handout-toolbar-controls\s*\{[\s\S]*?flex-wrap: wrap/)
  assert.match(css, /\.handout-indicator\s*\{[\s\S]*?border: 1px solid var\(--line-dark\)/)
  assert.match(css, /\.handout-count\s*\{[\s\S]*?background: var\(--badge-bg\)/)
  assert.match(app, /private-counselling-services/)
  assert.match(app, /import justinPortrait from "\.\/assets\/Justin\.png"/)
  assert.match(app, /src=\{justinPortrait\} alt="Portrait sketch of Justin Latos"/)
  assert.match(app, /mailto:justinlatos@protonmail\.com/)
  assert.match(app, /Private counselling services are separate from Miller/)
  assert.doesNotMatch(app, /trackEvent\([^)]*private/i)
  assert.match(modal, /aria-modal="true"/)
  assert.match(modal, /event\.key === "Escape"/)
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/)
  assert.match(modal, /opener\?\.focus\?\./)
})
