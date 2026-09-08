import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = relative => readFileSync(new URL(relative, import.meta.url), "utf8")

test("searched state makes results the main canvas without altering the top controls", () => {
  const app = read("../src/App.jsx")
  const css = read("../src/App.css")
  assert.match(app, /hero-layout \$\{shouldShowResults \? "has-results" : ""\}/)
  assert.match(css, /\.hero-layout\.has-results\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
  assert.match(css, /\.hero-layout\.has-results \.hero-art\s*\{[^}]*display:\s*none !important/s)
  assert.match(css, /\.hero-layout\.has-results \.results-panel\s*\{[^}]*max-width:\s*none/s)
  assert.match(app, /className="controls-row"/)
})

test("results use a responsive two-column grid and never force it on mobile", () => {
  const app = read("../src/App.jsx")
  const css = read("../src/App.css")
  assert.match(app, /data-layout="responsive-two-column"/)
  assert.match(css, /\.hero-layout\.has-results \.resource-list\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(css, /@media \(max-width: 959px\)[\s\S]*?\.hero-layout\.has-results \.resource-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.doesNotMatch(css, /\.hero-layout\.has-results \.resource-list\s*\{[^}]*overflow-x:\s*(auto|scroll)/s)
})

test("the compact guidance and result controls preserve email and refinement actions", () => {
  const app = read("../src/App.jsx")
  assert.match(app, /className="miller-next-step"/)
  assert.match(app, />Refine search<\/button>/)
  assert.match(app, />Email these results<\/button>/)
  assert.match(app, /matching resource\{results\.length === 1 \? "" : "s"\}/)
  assert.match(app, /conciseResourceDescription\(resource\.description\)/)
})

test("the result companion is a left-rail enhancement with safe responsive exits", () => {
  const app = read("../src/App.jsx")
  const css = read("../src/App.css")
  assert.match(app, /className="miller-results-companion-rail"/)
  assert.match(app, /key=\{`\$\{currentTheme\.name\}-results`\}/)
  assert.match(app, /animationEnabled=\{false\}/)
  assert.match(css, /min-width: 901px[\s\S]*?results-panel\.has-result-companion\s*\{[^}]*padding-left:\s*144px/)
  assert.match(css, /max-width: 759px[\s\S]*?\.miller-companion-travel\s*\{[^}]*display:\s*none/)
  assert.match(css, /max-width: 759px[\s\S]*?\.miller-results-companion-rail\s*\{[^}]*display:\s*none/)
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?results-panel\.has-result-companion\s*\{[^}]*padding-left:\s*24px/)
})
