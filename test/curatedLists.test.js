import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { parseCounsellingDocumentXml, proposeCanonicalMatches, publicListProjection } from "../server/curatedLists.js"

const documentPath = fileURLToPath(new URL("../Low cost counselling list.docx", import.meta.url))
const xml = execFileSync("unzip", ["-p", documentPath, "word/document.xml"], { encoding: "utf8" })
const parsed = parseCounsellingDocumentXml(xml)

test("the counselling DOCX parser retains eleven sections and raw review text", () => {
  assert.equal(parsed.summary.section_count, 11)
  assert.equal(parsed.summary.entry_count, 111)
  assert.deepEqual(parsed.sections.map((section) => section.title), ["GENERAL COUNSELLING","CHILDREN, YOUTH AND FAMILIES","OLDER ADULT COUNSELLING SERVICES","INDIGENOUS SERVICES","MULTILINGUAL","ADDICTION SUPPORT/COUNSELLING","HEALTH-RELATED","LGBTQIA2S+","TRAUMA","GRIEF SUPPORT","CRISIS LINES"])
  assert.ok(parsed.sections.flatMap((section) => section.items).every((item) => item.raw_source_text))
})

test("document-specific warnings flag duplicates, time-sensitive facts, malformed labels, and crisis entries", () => {
  const items = parsed.sections.flatMap((section) => section.items), codes = new Set(items.flatMap((item) => item.warnings.map((warning) => warning.code)))
  for (const code of ["possible_duplicate","time_sensitive","cost","residency","age_or_population","session_limit","referral","crisis","mislabeled_contact","no_website"]) assert.ok(codes.has(code), code)
  assert.ok(parsed.summary.duplicate_entry_count > 0)
})

test("canonical matching requires human selection when evidence is ambiguous", () => {
  const matches = proposeCanonicalMatches({ name: "Shared Program", phones: ["604-555-0100"], websites: [] }, [{ id: "a", name: "Shared Program", phone: "604-555-0100" }, { id: "b", name: "Other Program", phone: "604-555-0100" }])
  assert.equal(matches.length, 2)
  assert.equal(matches[0].classification, "confident")
  assert.equal(matches[1].classification, "possible")
})

test("draft lists have no public projection while published metadata does", () => {
  assert.equal(publicListProjection({ status: "draft", title: "Draft" }), null)
  assert.equal(publicListProjection({ id: "1", status: "published", slug: "test", title: "Test" }).title, "Test")
})

test("migration separates public approved content from private imports and source storage", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608150001_create_curated_lists.sql", import.meta.url), "utf8")
  for (const table of ["curated_lists","curated_list_sections","curated_list_items","curated_list_item_sections","list_import_batches","list_import_items"]) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
  assert.match(sql, /status = 'published'/)
  assert.match(sql, /verification_status = 'verified'/)
  assert.doesNotMatch(sql, /grant select on public\.list_import_(?:batches|items)/)
  assert.match(sql, /'curated-list-sources'.*false/s)
  assert.match(sql, /unique \(source_sha256, parser_version\)/)
})

test("forward migration makes trusted bulk import atomic, audited, idempotent, and canonical-free", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608150002_add_trusted_curated_list_import.sql", import.meta.url), "utf8")
  assert.match(sql, /create or replace function public\.trusted_bulk_import_curated_list/)
  assert.match(sql, /security definer/)
  assert.match(sql, /for update/)
  assert.match(sql, /final_disposition = 'list_only_entry'/)
  assert.match(sql, /review_method = 'trusted_bulk_import'/)
  assert.match(sql, /original_document_hash/)
  assert.match(sql, /parser_version/)
  assert.match(sql, /on conflict \(source_import_item_id\)[\s\S]*do nothing/)
  assert.match(sql, /parsing_status = 'committed'[\s\S]*idempotent',true/)
  assert.match(sql, /order by cs\.display_order, ii\.display_order/)
  assert.match(sql, /verification_status in \('verified','externally_verified','imported_from_trusted_source'\)/)
  assert.doesNotMatch(sql, /insert into public\.resource_registry|update public\.resource_registry|delete from public\.resource_registry/)
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/)
})

test("public list routes omit raw import text and admin routes remain protected", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/lists"/)
  assert.match(server, /app\.get\("\/api\/lists\/:slug"/)
  assert.match(server, /app\.post\("\/api\/admin\/list-imports"[^\n]*requireAdmin/)
  assert.match(server, /app\.post\("\/api\/admin\/curated-lists\/:id\/commit-import"[^\n]*requireAdmin/)
  assert.match(server, /structured_draft_committed/)
  assert.match(server, /trusted-bulk-import[^\n]*requireAdmin/)
  assert.match(server, /import_source_type !== "admin_docx"/)
  assert.match(server, /confirmed_publication/)
  const publicRoute = server.slice(server.indexOf('app.get("/api/lists/:slug"'), server.indexOf('app.get("/api/admin/curated-lists"'))
  assert.doesNotMatch(publicRoute, /raw_source_text|list_import_items|source_storage_path/)
})

test("public and admin interfaces expose lists, review warnings, print, and explicit publication boundaries", () => {
  const publicUi = fs.readFileSync(new URL("../src/lists/PreMadeLists.jsx", import.meta.url), "utf8"), adminUi = fs.readFileSync(new URL("../src/admin/CuratedListManager.jsx", import.meta.url), "utf8"), app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  assert.match(app, /Pre-made Lists/)
  assert.match(publicUi, /Print \/ Save PDF/)
  assert.match(publicUi, /premade-crisis-section/)
  assert.match(adminUi, /Original text and warnings/)
  assert.match(adminUi, /Keep as separate list entry/)
  assert.match(adminUi, /Link to existing Miller resource/)
  assert.match(adminUi, /Import all as list-only/)
  assert.match(adminUi, /Publication remains a separate action/)
  assert.match(adminUi, /Review or adjust individual entries/)
})
