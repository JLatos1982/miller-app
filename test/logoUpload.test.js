import test from "node:test"
import assert from "node:assert/strict"
import { LOGO_MAX_BYTES, safeLogoDataUrl, validateLogoFile } from "../src/handout/logoUpload.js"

test("logo validation accepts raster formats and rejects SVG or oversized files", () => {
  assert.equal(validateLogoFile({ type: "image/png", size: 5000 }), "")
  assert.equal(validateLogoFile({ type: "image/jpeg", size: 5000 }), "")
  assert.equal(validateLogoFile({ type: "image/webp", size: 5000 }), "")
  assert.match(validateLogoFile({ type: "image/svg+xml", size: 5000 }), /PNG, JPEG, or WebP/)
  assert.match(validateLogoFile({ type: "image/png", size: LOGO_MAX_BYTES + 1 }), /smaller than 2 MB/)
})

test("only validated raster data URLs can be embedded", () => {
  assert.equal(safeLogoDataUrl("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=")
  assert.equal(safeLogoDataUrl("data:image/svg+xml;base64,PHN2Zz4="), "")
  assert.equal(safeLogoDataUrl("javascript:alert(1)"), "")
})
