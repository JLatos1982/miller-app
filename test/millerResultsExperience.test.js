import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = relative => readFileSync(new URL(relative, import.meta.url), "utf8")

test("searched state keeps the guide scene between stable controls and wide results", () => {
  const app = read("../src/App.jsx")
  const css = read("../src/App.css")
  assert.match(app, /hero-layout \$\{shouldShowResults \? "has-results" : ""\}/)
  assert.match(css, /\.hero-layout\.has-results\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
  assert.match(css, /MILLER GUIDED RESULTS[\s\S]*?\.hero-layout\.has-results \.hero-art\s*\{[^}]*display:\s*block !important/s)
  assert.match(css, /MILLER GUIDED RESULTS[\s\S]*?\.hero-layout\.has-results \.results-panel\s*\{[^}]*max-width:\s*1120px/s)
  assert.match(app, /className="controls-row"/)
})

test("results use a two-column destination with a single-column narrow fallback", () => {
  const app = read("../src/App.jsx")
  const css = read("../src/App.css")
  assert.match(app, /data-layout="two-column-responsive"/)
  assert.match(css, /MILLER GUIDED RESULTS[\s\S]*?\.hero-layout\.has-results \.resource-list\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(css, /@media \(max-width: 759px\)[\s\S]*?\.hero-layout\.has-results \.resource-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
  assert.doesNotMatch(css, /\.hero-layout\.has-results \.resource-list\s*\{[^}]*overflow-x:\s*(auto|scroll)/s)
  assert.match(app, /Showing local and regional support options for/)
  assert.match(app, /<strong>Service area:<\/strong> \{resource\.scopeNote\}/)
})

test("the richer trained speech bubble returns without duplicating a guidance card", () => {
  const app = read("../src/App.jsx")
  const css = read("../src/App.css")
  assert.doesNotMatch(app, /className="miller-guidance-panel"/)
  assert.match(app, /renderMessageWithLinks\(displayedReply\)/)
  assert.match(app, /miller-practical-context/)
  assert.match(app, /miller-related-supports/)
  assert.match(app, />Email these results<\/button>/)
  assert.match(app, /matching resource\{results\.length === 1 \? "" : "s"\}/)
  assert.match(app, /conciseResourceDescription\(resource\.description\)/)
  assert.match(css, /MILLER GUIDED RESULTS[\s\S]*?\.hero-layout\.has-results \.miller-bubble\s*\{[^}]*width:\s*clamp\(440px, 50vw, 580px\)/s)
  assert.match(css, /MILLER GUIDED RESULTS[\s\S]*?\.hero-layout\.has-results \.miller-bubble\s*\{[^}]*max-height:\s*none/s)
  assert.match(css, /MILLER GUIDED RESULTS[\s\S]*?\.hero-layout\.has-results \.miller-bubble\s*\{[^}]*overflow:\s*visible/s)
  assert.match(app, /millerReadingPosition !== "home" \|\| shouldShowResults/)
  assert.match(css, /\.hero-layout\.has-results \.miller-satchel-zone\s*\{[^}]*display:\s*none !important/s)
})

test("the original character and one dog remain the results companion scene", () => {
  const app = read("../src/App.jsx")
  const css = read("../src/App.css")
  assert.equal((app.match(/<MillerSheepdog/g) || []).length, 1)
  assert.doesNotMatch(app, /!shouldShowResults \? <MillerSheepdog/)
  assert.doesNotMatch(app, /miller-results-companion-rail/)
  assert.match(css, /MILLER GUIDED RESULTS[\s\S]*?\.hero-layout\.has-results \.miller-figure\s*\{[^}]*left:\s*clamp\(/s)
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.hero-layout\.has-results \.miller-figure,[\s\S]*?display:\s*none !important/s)
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.hero-layout\.has-results \.miller-figure[\s\S]*?animation:\s*none !important/s)
})

test("the existing Miller and dog nodes travel into results instead of being replaced", () => {
  const app = read("../src/App.jsx")
  const dog = read("../src/companion/MillerSheepdog.jsx")
  assert.match(app, /captureResultJourneyOrigin\(companionGeneration\)/)
  assert.match(app, /journeyKeyframes\(startRect, snapshotJourneyRect\(element\?\.getBoundingClientRect\(\)\), options\)/)
  assert.match(app, /MILLER_RESULTS_JOURNEY\.dog/)
  assert.match(app, /MILLER_RESULTS_JOURNEY\.character/)
  assert.doesNotMatch(app, /destinationBesideRenderedResult/)
  assert.equal((app.match(/<MillerSheepdog/g) || []).length, 1)
  assert.match(dog, /resultJourneyPhase === 'traveling'/)
})
