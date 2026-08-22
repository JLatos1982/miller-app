import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { submitResource } from "../src/publicApi.js"
import { formatAttachmentSize, MAX_SUGGESTION_ATTACHMENT_BYTES, validateResourceAttachmentSelection } from "../src/site/resourceAttachmentSelection.js"

const valid = (name = "guide.pdf", type = "application/pdf", size = 1024) => ({ name, type, size })

test("Satchel attachment selection accepts supported files and rejects unsafe convenience cases", () => {
  assert.equal(validateResourceAttachmentSelection([valid(), valid("notes.txt", "text/plain")]), "")
  assert.match(validateResourceAttachmentSelection([valid(), valid("two.png", "image/png"), valid("three.txt", "text/plain")]), /up to 2 files/)
  assert.match(validateResourceAttachmentSelection([valid("guide.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]), /isn't supported/)
  assert.match(validateResourceAttachmentSelection([valid("large.pdf", "application/pdf", MAX_SUGGESTION_ATTACHMENT_BYTES + 1)]), /5 MB/)
  assert.equal(formatAttachmentSize(1536), "2 KB")
})

test("text-only resource submissions retain the JSON request contract", async () => {
  let request
  await submitResource({ resource_name: "Community service", city: "Surrey", note: "A meaningful public resource note.", attachments: [] }, { fetchImpl: async (...args) => { request = args; return { ok: true, json: async () => ({ submitted: true }) } } })
  assert.equal(request[1].headers["Content-Type"], "application/json")
  assert.deepEqual(JSON.parse(request[1].body), { resource_name: "Community service", city: "Surrey", note: "A meaningful public resource note." })
})

test("attachment submissions use FormData without a manually set multipart boundary", async () => {
  let request
  const file = new Blob(["resource note"], { type: "text/plain" })
  Object.defineProperty(file, "name", { value: "note.txt" })
  await submitResource({ resource_name: "Community service", city: "Surrey", note: "A meaningful public resource note.", attachments: [file] }, { fetchImpl: async (...args) => { request = args; return { ok: true, json: async () => ({ submitted: true, attachment_count: 1 }) } } })
  assert.ok(request[1].body instanceof FormData)
  assert.equal(request[1].headers, undefined)
  assert.equal(request[1].body.get("note"), "A meaningful public resource note.")
  assert.equal(request[1].body.getAll("attachments").length, 1)
})

test("Satchel markup keeps attachments modest and omits storage/scanner internals", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const picker = fs.readFileSync(new URL("../src/site/ResourceAttachmentPicker.jsx", import.meta.url), "utf8")
  assert.match(picker, /Attach resource documents <span>\(optional\)<\/span>/)
  assert.match(picker, /Please don't upload medical records, identification, or other confidential personal information\./)
  assert.match(picker, /Drop resource files here/)
  assert.match(picker, /or choose files/)
  assert.match(picker, /type="file"/)
  assert.match(picker, /onDrop=/)
  assert.match(picker, /Remove/)
  assert.match(app, /Thanks — your note and attached resource documents were submitted for review\./)
  assert.doesNotMatch(`${app}\n${picker}`, /ClamAV|pending_scan|createSignedUrl|resource-suggestion-attachments/)
})
