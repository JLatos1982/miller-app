import test from "node:test"
import assert from "node:assert/strict"
import { clearActiveReviewRunsForTests, runResourceReviewPipeline } from "../server/review/orchestrator.js"

function mockSupabase() {
  let savedUpdate
  const resource = { id: 7, name: "Example Resource", website: "" }
  const run = { id: 11, resource_id: 7, status: "running" }

  return {
    get savedUpdate() { return savedUpdate },
    from(table) {
      if (table === "tavily_resources") {
        return {
          select() {
            return {
              eq() { return { single: async () => ({ data: resource, error: null }) } },
              neq() { return { order() { return { limit: async () => ({ data: [], error: null }) } } } },
            }
          },
        }
      }

      return {
        insert() { return { select() { return { single: async () => ({ data: run, error: null }) } } } },
        update(value) {
          savedUpdate = value
          return {
            eq() {
              return {
                select() { return { single: async () => ({ data: { ...run, ...value }, error: null }) } },
                then(resolve) { return Promise.resolve({ error: null }).then(resolve) },
              }
            },
          }
        },
      }
    },
  }
}

test("preserves partial results when model-backed agents fail", async () => {
  clearActiveReviewRunsForTests()
  const supabase = mockSupabase()
  const openai = { responses: { create: async () => ({ output_text: "malformed" }) } }
  const result = await runResourceReviewPipeline(7, { supabase, openai })

  assert.equal(result.status, "completed")
  assert.equal(result.review_recommendation, "manual_review")
  assert.equal(result.quality_results.url_status, "unchecked")
  assert.ok(result.agent_errors.resource_review)
})

test("rejects an accidental concurrent run for the same resource", async () => {
  clearActiveReviewRunsForTests()
  const supabase = mockSupabase()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const openai = { responses: { create: async () => { await gate; return { output_text: "malformed" } } } }

  const first = runResourceReviewPipeline(7, { supabase, openai })
  await assert.rejects(() => runResourceReviewPipeline(7, { supabase, openai }), /already running/)
  release()
  await first
})

