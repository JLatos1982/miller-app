import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
const page = fs.readFileSync(new URL("../src/owner/DirectoryHealthAuditBackPage.jsx", import.meta.url), "utf8")
const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
const css = fs.readFileSync(new URL("../src/App.css", import.meta.url), "utf8")

test("directory health audit is an owner-only hidden route with noindex protections", () => {
  assert.match(app, /window\.location\.pathname === "\/owner\/directory-health-audit"/)
  assert.match(app, /const isInternalRoute = isAdminRoute \|\| isOwnerRoute/)
  assert.match(app, /Owner sign in required/)
  assert.match(server, /app\.get\("\/owner\/directory-health-audit"[\s\S]*X-Robots-Tag", "noindex, nofollow, noarchive"/)
  assert.match(page, /noindex,nofollow,noarchive/)
  assert.doesNotMatch(app.slice(app.indexOf('className="hero-layout"')), /directory-health-audit/)
})

test("internal page presents the bounded synthetic offer without filesystem paths or public intake", () => {
  for (const text of ["Directory Health Audit", "500", "89/100", "57", "18", "2", "3", "6", "Needs refinement before public launch", "Next prospect ideas"]) assert.match(page, new RegExp(text.replaceAll("/", "\\/")))
  assert.match(page, /Fictional synthetic demo — not client data/)
  assert.match(page, /AI alone does not authorize corrections/)
  assert.match(page, /No automatic database writes/)
  assert.doesNotMatch(page, /supabase\/migrations|\/Users\/|test\/fixtures|checkout|payment/i)
})

test("internal draft has a mobile-friendly layout", () => {
  assert.match(css, /\.directory-audit-draft/)
  assert.match(css, /@media\(max-width:650px\)\{\.directory-audit-draft/)
})
