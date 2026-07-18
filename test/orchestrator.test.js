import test from "node:test"
import assert from "node:assert/strict"
import { clearActiveReviewRunsForTests, runResourceReviewPipeline } from "../server/review/orchestrator.js"

function mockSupabase({ cachedReview = null } = {}) {
  let savedUpdate
  let insertCount = 0
  const resource = { id: 7, name: "Example Resource", website: "" }
  const run = { id: 11, resource_id: 7, status: "running" }

  return {
    get savedUpdate() { return savedUpdate },
    get insertCount() { return insertCount },
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

      const cachedQuery = {
        eq() { return this },
        order() { return this },
        limit() { return this },
        async maybeSingle() { return { data: cachedReview, error: null } },
      }

      return {
        select() { return cachedQuery },
        insert(value) {
          insertCount += 1
          return { select() { return { single: async () => ({ data: { ...run, ...value }, error: null }) } } }
        },
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

test("reuses a matching completed review without running agents", async () => {
  clearActiveReviewRunsForTests()
  const cachedReview = { id: 5, resource_id: 7, status: "completed", review_recommendation: "approve" }
  const supabase = mockSupabase({ cachedReview })
  let modelCalls = 0
  const openai = { responses: { create: async () => { modelCalls += 1; throw new Error("should not run") } } }

  const result = await runResourceReviewPipeline(7, { supabase, openai })

  assert.equal(result.id, cachedReview.id)
  assert.equal(result.reused, true)
  assert.equal(supabase.insertCount, 0)
  assert.equal(modelCalls, 0)
})

test("force rerun bypasses a matching completed review", async () => {
  clearActiveReviewRunsForTests()
  const supabase = mockSupabase({ cachedReview: { id: 5, resource_id: 7, status: "completed" } })
  const openai = { responses: { create: async () => ({ output_text: "malformed" }) } }

  const result = await runResourceReviewPipeline(7, { supabase, openai, force: true })

  assert.equal(result.reused, false)
  assert.equal(supabase.insertCount, 1)
})

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

