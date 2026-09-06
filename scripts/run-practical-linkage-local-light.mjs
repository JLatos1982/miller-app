import fs from "node:fs/promises"

const ARTIFACT = new URL("../data/miller-practical-linkage-diagnostic-v1.json", import.meta.url)
const model = "qwen2.5:1.5b"
const endpoint = new URL("http://127.0.0.1:11434/api/chat")
const allowedReasons = new Set(["title_distance_only", "title_after_address", "organization_only_linkage", "insufficient_context"])
const schema = { type: "object", additionalProperties: false, required: ["classification", "reason", "evidence_phrase"], properties: { classification: { type: "string", enum: ["program_site_supported", "program_site_probable", "unrelated_site", "insufficient_evidence"] }, reason: { type: "string", maxLength: 240 }, evidence_phrase: { type: "string", maxLength: 240 } } }
const artifact = JSON.parse(await fs.readFile(ARTIFACT, "utf8"))
let calls = 0
for (const record of artifact.records) {
  for (const source of record.sources) {
    for (const candidate of source.candidates || []) {
      if (candidate.program_site_disposition === "program_site_supported" || !allowedReasons.has(candidate.old_rule_failure_reason) || candidate.local_light) continue
      calls++
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12_000)
      try {
        const response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: false, keep_alive: "5m", format: schema, options: { temperature: 0, num_ctx: 3072, num_predict: 180 }, messages: [
          { role: "system", content: "You are an advisory evidence classifier. Use only supplied evidence. Never browse, invent an address, infer from outside facts, or override a contradiction. The candidate address is fixed. Classify whether the text supports it as a location of the named target program, not merely its parent organization. Return JSON only." },
          { role: "user", content: JSON.stringify({ target_program: record.name, recognized_aliases: [record.name.split(/\s+[-–—]\s+/)[0]], organization: record.organization, candidate_address: candidate.address, source_type: source.url.includes("bc.211.ca/result/") ? "bc211_service_result" : "trusted_public_source", headings_and_structure: candidate.structural_context, bounded_source_context: candidate.context }) },
        ] }) })
        if (!response.ok) throw new Error(`ollama_http_${response.status}`)
        const payload = await response.json(), parsed = JSON.parse(payload?.message?.content || "")
        if (!schema.properties.classification.enum.includes(parsed.classification) || typeof parsed.reason !== "string" || typeof parsed.evidence_phrase !== "string") throw new Error("local_light_schema_invalid")
        if (parsed.evidence_phrase && !candidate.context.toLowerCase().includes(parsed.evidence_phrase.toLowerCase())) parsed.classification = "insufficient_evidence"
        candidate.local_light = { ...parsed, model, advisory_only: true, mutation_authority: false }
      } catch (error) {
        candidate.local_light = { classification: "insufficient_evidence", reason: String(error?.message || error).slice(0, 240), evidence_phrase: "", model, advisory_only: true, mutation_authority: false, unavailable: true }
      } finally { clearTimeout(timer) }
      await fs.writeFile(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
    }
  }
}
const reviews = artifact.records.flatMap((record) => record.sources.flatMap((source) => (source.candidates || []).flatMap((candidate) => candidate.local_light ? [{ resource_id: record.resource_id, name: record.name, source_url: source.url, address: candidate.address, deterministic_reason: candidate.old_rule_failure_reason, ...candidate.local_light }] : [])))
artifact.local_light_summary = { calls, reviewed: reviews.length, classifications: Object.entries(reviews.reduce((counts, review) => ({ ...counts, [review.classification]: (counts[review.classification] || 0) + 1 }), {})).map(([classification, count]) => ({ classification, count })), advisory_promotions: 0 }
await fs.writeFile(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...artifact.local_light_summary, suggestions: reviews.filter((review) => ["program_site_supported", "program_site_probable"].includes(review.classification)) }, null, 2))
