import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { canonicalSeedId, comparePublicResources, proposeMatches, proposedCanonicalIdForSource, resolveConfirmedAlias } from "../server/resourceIdentity.js"
import decisions from "../data/resource-match-decisions.json" with { type: "json" }

test("canonical seed IDs are immutable-format and deterministic per source alias", () => {
  const id = canonicalSeedId("curated_bundle", "curated:abc")
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(id, canonicalSeedId("curated_bundle", "curated:abc"))
  assert.notEqual(id, canonicalSeedId("tavily_resource", "curated:abc"))
})

test("weak same-domain or same-address evidence never automatically merges", () => {
  const domainOnly = comparePublicResources({ name: "Program A", website: "https://health.example/a" }, { name: "Different Program", website: "https://health.example/b" })
  const addressOnly = comparePublicResources({ name: "Program A", address: "1 Main St" }, { name: "Program B", address: "1 Main St" })
  assert.notEqual(domainOnly.classification, "high_confidence")
  assert.notEqual(addressOnly.classification, "high_confidence")
})

test("matching report proposes evidence but leaves every decision pending", () => {
  const report = proposeMatches([{ id: "curated:1", name: "Clinic", website: "https://example.org/clinic" }], [{ id: 2, name: "Clinic", website: "https://example.org/clinic" }])
  assert.equal(report[0].classification, "high_confidence")
  assert.equal(report[0].decision, "pending")
})

test("unmatched aliases remain valid and confirmed aliases resolve backward IDs", () => {
  const aliases = [{ resource_id: "uuid-1", source_type: "curated_bundle", source_native_id: "curated:1" }, { resource_id: "uuid-2", source_type: "tavily_resource", source_native_id: "22" }]
  assert.equal(resolveConfirmedAlias("curated_bundle", "curated:1", aliases), "uuid-1")
  assert.equal(resolveConfirmedAlias("tavily_resource", 22, aliases), "uuid-2")
  assert.equal(resolveConfirmedAlias("curated_bundle", "unmatched", aliases), null)
})

test("unapplied registry migration supports aliases, multiple locations, audit, and strict public states", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608070001_add_resource_geography.sql", import.meta.url), "utf8")
  assert.match(sql, /create table if not exists public\.resource_registry/)
  assert.match(sql, /unique \(source_type, source_native_id\)/)
  assert.match(sql, /create table if not exists public\.resource_locations/)
  assert.doesNotMatch(sql, /unique\s*\(resource_id\)/i)
  assert.match(sql, /location_type = 'fixed' and geocode_status = 'verified' and review_status = 'approved'/)
  assert.match(sql, /create table if not exists public\.resource_location_audit/)
  assert.match(sql, /revoke all on table[\s\S]*from anon, authenticated/)
  assert.doesNotMatch(sql, /alter table public\.tavily_resources|delete from public\.tavily_resources/)
})

test("local human decisions merge only 160 and 180 while SHARE 30 remains separate", () => {
  assert.equal(proposedCanonicalIdForSource("tavily_resource", 160, decisions.decisions), canonicalSeedId("curated_bundle", "curated:jvq43c"))
  assert.equal(proposedCanonicalIdForSource("tavily_resource", 180, decisions.decisions), canonicalSeedId("curated_bundle", "curated:85ses8"))
  assert.equal(proposedCanonicalIdForSource("tavily_resource", 30, decisions.decisions), canonicalSeedId("tavily_resource", 30))
  assert.equal(decisions.decisions.find((item) => item.right_source_native_id === "30").decision, "defer")
  assert.ok(decisions.decisions.every((item) => item.scope === "source_identity_only"))
})

test("seed planner is dry-run generation with alias ownership assertions and no database writes", () => {
  const source = fs.readFileSync(new URL("../scripts/registry-seed-plan.mjs", import.meta.url), "utf8")
  assert.match(source, /console\.log\(lines\.join/)
  assert.match(source, /Alias ownership conflict/)
  assert.match(source, /on conflict \(source_type, source_native_id\) do nothing/)
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
})

test("registry activation locks reconciled identity counts and requires an explicit apply flag", () => {
  const source = fs.readFileSync(new URL("../scripts/registry-seed.mjs", import.meta.url), "utf8")
  assert.match(source, /curatedRows: 333, curatedAliases: 327, tavilyAliases: 105, canonical: 430, aliases: 432/)
  assert.match(source, /process\.argv\.includes\("--apply"\)/)
  assert.match(source, /Refusing to seed an unexpected Supabase project/)
  assert.match(source, /Alias ownership conflict/)
})
