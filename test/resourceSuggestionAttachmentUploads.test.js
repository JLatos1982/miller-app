import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { createPublicWriteHandlers } from "../server/publicWrites.js"
import {
  MAX_RESOURCE_SUGGESTION_ATTACHMENT_BYTES,
  MAX_RESOURCE_SUGGESTION_ATTACHMENTS,
  MAX_RESOURCE_SUGGESTION_ATTACHMENT_TOTAL_BYTES,
  createResourceSubmissionWithAttachments,
  prepareResourceSuggestionAttachments,
  sanitizeAttachmentFilename,
} from "../server/resourceSuggestionAttachments.js"

function file(name, mimetype, buffer) {
  return { originalname: name, mimetype, buffer }
}

const pdf = Buffer.from("%PDF-1.7\nminimal\n%%EOF")
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9])
const text = Buffer.from("A public resource suggestion with ordinary text.\n", "utf8")

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
  }
}

function attachmentSupabase({ failUploadAt, metadataError } = {}) {
  const calls = { uploads: [], removes: [], metadata: [], submissions: [], deletes: [] }
  let uploadCount = 0
  const storage = {
    async upload(path, buffer, options) {
      uploadCount += 1
      calls.uploads.push({ path, buffer, options })
      return { error: uploadCount === failUploadAt ? { code: "storage_failed" } : null }
    },
    async remove(paths) { calls.removes.push(paths); return { error: null } },
  }
  const supabase = {
    storage: { from(bucket) { assert.equal(bucket, "resource-suggestion-attachments"); return storage } },
    from(table) {
      if (table === "resource_submissions") {
        return {
          insert(rows) {
            calls.submissions.push(rows)
            return { select() { return { async single() { return { data: { id: "10000000-0000-0000-0000-000000000001" }, error: null } } } } }
          },
          delete() { return { async eq(column, value) { calls.deletes.push({ column, value }); return { error: null } } } },
        }
      }
      if (table === "resource_submission_attachments") {
        return { async insert(rows) { calls.metadata.push(rows); return { error: metadataError ? { code: "metadata_failed" } : null } } }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }
  return { supabase, calls }
}

test("valid PDF, PNG, JPEG, and TXT attachments are detected, hashed, and prepared privately", () => {
  for (const [name, mime, buffer, expectedMime, expectedFilename = name] of [
    ["guide.pdf", "application/pdf", pdf, "application/pdf"],
    ["logo.png", "image/png", png, "image/png"],
    ["photo.jpeg", "image/jpeg", jpeg, "image/jpeg", "photo.jpg"],
    ["notes.txt", "text/plain", text, "text/plain"],
  ]) {
    const [attachment] = prepareResourceSuggestionAttachments([file(name, mime, buffer)])
    assert.equal(attachment.mimeType, expectedMime)
    assert.match(attachment.sha256, /^[0-9a-f]{64}$/)
    assert.equal(attachment.displayFilename, expectedFilename)
  }
})

test("attachment validation rejects count, byte, total, signature, MIME, and binary-text failures", () => {
  assert.throws(() => prepareResourceSuggestionAttachments([
    file("one.txt", "text/plain", text), file("two.txt", "text/plain", text), file("three.txt", "text/plain", text),
  ]), /at most 2 attachments/)
  assert.throws(() => prepareResourceSuggestionAttachments([file("large.txt", "text/plain", Buffer.alloc(MAX_RESOURCE_SUGGESTION_ATTACHMENT_BYTES + 1, 0x61))]), /5 MB/)
  assert.equal(MAX_RESOURCE_SUGGESTION_ATTACHMENTS, 2)
  assert.equal(MAX_RESOURCE_SUGGESTION_ATTACHMENT_TOTAL_BYTES, 10 * 1024 * 1024)
  assert.throws(() => prepareResourceSuggestionAttachments([file("fake.pdf", "application/pdf", Buffer.from("not a PDF"))]), /matching file content/)
  assert.throws(() => prepareResourceSuggestionAttachments([file("fake-version.pdf", "application/pdf", Buffer.from("%PDF-x.y"))]), /matching file content/)
  assert.throws(() => prepareResourceSuggestionAttachments([file("fake.png", "image/png", Buffer.from("not a PNG"))]), /matching file content/)
  assert.throws(() => prepareResourceSuggestionAttachments([file("fake.jpg", "image/jpeg", Buffer.from("not a JPEG"))]), /matching file content/)
  assert.throws(() => prepareResourceSuggestionAttachments([file("binary.txt", "text/plain", Buffer.from([0, 255, 0, 1]))]), /matching file content/)
  assert.throws(() => prepareResourceSuggestionAttachments([file("guide.pdf", "image/png", pdf)]), /matching file content/)
  assert.throws(() => prepareResourceSuggestionAttachments([file("guide.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK\x03\x04"))]), /matching file content/)
})

test("filenames are display-only, bounded, and cannot create storage directories", () => {
  assert.equal(sanitizeAttachmentFilename("../../private\\guide.PDF", "pdf"), "guide.pdf")
  assert.equal(sanitizeAttachmentFilename("\0unsafe\n name.txt", "txt"), "unsafe name.txt")
  assert.match(sanitizeAttachmentFilename("a".repeat(500) + ".png", "png"), /^a{140}\.png$/)
})

test("attachment workflow uploads private randomized paths and writes pending-scan metadata", async () => {
  const attachments = prepareResourceSuggestionAttachments([
    file("guide.pdf", "application/pdf", pdf),
    file("notes.txt", "text/plain", text),
  ])
  const { supabase, calls } = attachmentSupabase()
  const result = await createResourceSubmissionWithAttachments({ supabase, submission: { category: "A meaningful resource note." }, attachments, log: { error() {} } })

  assert.deepEqual(result, { submitted: true, attachment_count: 2 })
  assert.equal(calls.uploads.length, 2)
  assert.match(calls.uploads[0].path, /^10000000-0000-0000-0000-000000000001\/[0-9a-f-]+\.pdf$/)
  assert.match(calls.uploads[1].path, /^10000000-0000-0000-0000-000000000001\/[0-9a-f-]+\.txt$/)
  assert.equal(calls.metadata[0].length, 2)
  assert.deepEqual(calls.metadata[0].map((row) => row.status), ["pending_scan", "pending_scan"])
  assert.ok(calls.metadata[0].every((row) => /^[0-9a-f]{64}$/.test(row.content_sha256)))
  assert.equal(calls.removes.length, 0)
})

test("attachment failures remove uploaded objects and roll back the parent submission", async () => {
  const attachments = prepareResourceSuggestionAttachments([
    file("guide.pdf", "application/pdf", pdf), file("notes.txt", "text/plain", text),
  ])
  for (const options of [{ failUploadAt: 1 }, { failUploadAt: 2 }, { metadataError: true }]) {
    const { supabase, calls } = attachmentSupabase(options)
    await assert.rejects(createResourceSubmissionWithAttachments({ supabase, submission: { category: "A meaningful resource note." }, attachments, log: { error() {} } }))
    assert.equal(calls.deletes.length, 1)
    const expectedRemoved = options.failUploadAt === 1 ? 0 : options.failUploadAt === 2 ? 1 : 2
    assert.equal(calls.removes.flat().length, expectedRemoved)
  }
})

test("JSON-only submissions retain their existing handler contract", async () => {
  const writes = []
  const handlers = createPublicWriteHandlers({
    supabase: { from(table) { return { async insert(rows) { writes.push({ table, rows }); return { error: null } } } } },
    log: { error() {} },
  })
  const res = responseRecorder()
  await handlers.createResourceSubmission({ body: { note: "A meaningful resource suggestion." } }, res)
  assert.equal(res.statusCode, 201)
  assert.deepEqual(res.body, { submitted: true })
  assert.equal(writes[0].table, "resource_submissions")
})

test("server route limits multipart bodies and does not expose attachment access", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(source, /multer\.memoryStorage\(\)/)
  assert.match(source, /fileSize: MAX_RESOURCE_SUGGESTION_ATTACHMENT_BYTES/)
  assert.match(source, /files: MAX_RESOURCE_SUGGESTION_ATTACHMENTS/)
  assert.match(source, /app\.post\("\/api\/resource-submissions", submissionRateLimit, parseResourceSubmissionMultipart/)
  assert.doesNotMatch(source, /resource-suggestion-attachments[\s\S]*createSignedUrl/)
})
