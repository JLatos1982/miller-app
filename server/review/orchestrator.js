import { checkResourceQuality } from "./linkQuality.js"
import { findPossibleDuplicates, reviewResource, suggestResourceTags } from "./agents.js"
import { REVIEW_MODEL, REVIEW_SCHEMA_VERSION } from "./constants.js"
import { createReviewFingerprint } from "./fingerprint.js"

const activeRuns = new Set()

function errorMessage(error) {
  return String(error?.message || "Unknown review error").slice(0, 500)
}

function settledValue(result) {
  return result.status === "fulfilled" ? result.value : null
}

export async function runResourceReviewPipeline(resourceId, { supabase, openai, fetchImpl, lookup, force = false }) {
  const lockKey = String(resourceId)
  if (activeRuns.has(lockKey)) {
    const error = new Error("A review is already running for this resource.")
    error.code = "REVIEW_ALREADY_RUNNING"
    throw error
  }

  activeRuns.add(lockKey)
  let reviewRun
  try {
    const { data: resource, error: resourceError } = await supabase
      .from("tavily_resources")
      .select("*")
      .eq("id", resourceId)
      .single()
    if (resourceError || !resource) {
      const error = new Error("Resource not found.")
      error.code = "RESOURCE_NOT_FOUND"
      throw error
    }

    const reviewFingerprint = createReviewFingerprint(resource)

    if (!force) {
      const { data: cachedReview, error: cachedReviewError } = await supabase
        .from("ai_resource_reviews")
        .select("*")
        .eq("resource_id", resourceId)
        .eq("status", "completed")
        .eq("review_fingerprint", reviewFingerprint)
        .eq("model_identifier", REVIEW_MODEL)
        .eq("schema_version", REVIEW_SCHEMA_VERSION)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cachedReviewError) throw new Error("Could not check for a reusable AI review.")
      if (cachedReview) return { ...cachedReview, reused: true }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("ai_resource_reviews")
      .insert({ resource_id: resourceId, status: "running", review_fingerprint: reviewFingerprint, model_identifier: REVIEW_MODEL, schema_version: REVIEW_SCHEMA_VERSION })
      .select("*")
      .single()
    if (insertError) {
      const error = new Error(insertError.code === "23505" ? "A review is already running for this resource." : "Could not create the AI review run.")
      error.code = insertError.code === "23505" ? "REVIEW_ALREADY_RUNNING" : "REVIEW_STORAGE_ERROR"
      throw error
    }
    reviewRun = inserted

    // The table has no phone/address columns, so candidate narrowing uses the available
    // website, organization, title, city, and category fields only.
    const { data: candidateRows, error: candidateError } = await supabase
      .from("tavily_resources")
      .select("id,name,organization,website,city,category,service_type,description")
      .neq("id", resourceId)
      .order("created_at", { ascending: false })
      .limit(250)
    if (candidateError) throw new Error("Could not load duplicate candidates.")

    const results = await Promise.allSettled([
      reviewResource(resource, { openai }),
      suggestResourceTags(resource, { openai }),
      findPossibleDuplicates(resource, candidateRows || [], { openai }),
      checkResourceQuality(resource, { fetchImpl, lookup }),
    ])

    const names = ["resource_review", "tagging", "duplicate_detection", "link_quality"]
    const agentErrors = Object.fromEntries(results
      .map((result, index) => result.status === "rejected" ? [names[index], errorMessage(result.reason)] : null)
      .filter(Boolean))
    const successful = results.filter((result) => result.status === "fulfilled").length
    const resourceReview = settledValue(results[0])

    const updates = {
      status: successful ? "completed" : "failed",
      review_recommendation: resourceReview?.recommendation || "manual_review",
      review_confidence: resourceReview?.confidence ?? null,
      review_reason: resourceReview?.reason || "One or more review checks failed; manual review is required.",
      review_results: resourceReview,
      suggested_tags: settledValue(results[1]),
      duplicate_candidates: settledValue(results[2]),
      quality_results: settledValue(results[3]),
      agent_errors: agentErrors,
      error_message: successful ? null : "All review checks failed.",
      completed_at: new Date().toISOString(),
    }

    const { data: completed, error: updateError } = await supabase
      .from("ai_resource_reviews")
      .update(updates)
      .eq("id", reviewRun.id)
      .select("*")
      .single()
    if (updateError) throw new Error("Could not save the AI review results.")
    return { ...completed, reused: false }
  } catch (error) {
    if (reviewRun?.id) {
      await supabase.from("ai_resource_reviews").update({ status: "failed", error_message: errorMessage(error), completed_at: new Date().toISOString() }).eq("id", reviewRun.id)
    }
    throw error
  } finally {
    activeRuns.delete(lockKey)
  }
}

export function clearActiveReviewRunsForTests() {
  activeRuns.clear()
}
