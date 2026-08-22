import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
test("About This Site uses the existing accessible modal and visitor-safe copy", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const modal = fs.readFileSync(new URL("../src/site/AccessibleModal.jsx", import.meta.url), "utf8")
  const about = app.match(/openInfoModal === "about-site"[\s\S]*?<\/AccessibleModal>/)?.[0] || ""
  assert.match(about, /About This Site|A little help finding your way|How it works/)
  assert.match(about, /Suggest a Resource \/ Notes/)
  assert.match(about, /not a counselling, medical, or emergency service/)
  assert.match(modal, /event\.key === "Escape"/)
  assert.match(modal, /opener\?\.focus\?\./)
  assert.doesNotMatch(about, /Supabase|Storage|bucket|API route|service.role|RLS|ClamAV|quarantine|Render/i)
})
