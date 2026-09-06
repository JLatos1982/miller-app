import fs from "node:fs/promises"

const cohortPath = new URL("../data/miller-practical-discovery-cohort-v1.json", import.meta.url)
const outputPath = new URL("../data/miller-editorial-cleanup-candidates-v1.json", import.meta.url)
const cohort = JSON.parse(await fs.readFile(cohortPath, "utf8"))
if (cohort.version !== "miller-practical-discovery-cohort-v1" || cohort.selected?.length !== 87) throw new Error("completed_cohort_required")
const candidates = (cohort.editorial_cleanup || []).map((item) => ({ uuid: item.uuid, name: item.name, classification: item.proposed_classification, proposed_action: item.recommended_later_action }))
if (candidates.length !== 19) throw new Error(`editorial_cleanup_count_drift:${candidates.length}`)
await fs.writeFile(outputPath, `${JSON.stringify({ version: "miller-editorial-cleanup-candidates-v1", source_cohort: cohort.version, production_mutations: 0, candidates }, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ candidates: candidates.length, commercial_intermediaries: candidates.filter((item) => item.classification === "commercial_referral_intermediary").length, generic_information: candidates.filter((item) => item.classification === "generic_directory_or_information").length }, null, 2))
