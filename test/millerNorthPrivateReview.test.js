import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("Miller North review uses the existing protected admin API and a private route", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const review = fs.readFileSync(new URL("../src/admin/MillerNorthIncidentReview.jsx", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/admin\/miller-north\/incidents", requireAdmin/)
  assert.match(server, /Cache-Control", "private, no-store"/)
  assert.match(app, /window\.location\.pathname === "\/admin\/miller-north"/)
  assert.match(app, /<MillerNorthIncidentReview\/>/)
  assert.match(review, /adminFetch\("\/api\/admin\/miller-north\/incidents"\)/)
  assert.match(review, /Accountability &amp; follow-up/)
  assert.doesNotMatch(app, /FirstNationsHealthcareEvidenceFeather/)
})
