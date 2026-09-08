import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { compareAccountabilityWatch, validateAccountabilityWatch } from "../server/millerNorthAccountabilityWatch.js"

const watch = JSON.parse(readFileSync(new URL("../src/data/miller-north-accountability-watch-v1.json", import.meta.url), "utf8"))
validateAccountabilityWatch(watch)
const previous = structuredClone(watch)
const fnho = previous.chains.find(chain => chain.chain_id === "mnaw_fnho")
fnho.sources.pop()
const example = compareAccountabilityWatch(previous, watch)
const dir = new URL("../artifacts/miller-north/", import.meta.url)
mkdirSync(dir, { recursive: true })
const report = `# Miller North Accountability Watch v1\n\nReview date: ${watch.review_date}.\n\n${watch.caution}\n\n## Reading the chains\n\nThese five chains describe public documentary evidence only. “Implementation evidence” means a document supports an action, program, report, or response; it does not establish a measured outcome unless that document supplies one. No chain ranks a jurisdiction or decides individual allegations.\n\n${watch.chains.map(chain => `## ${chain.title} — ${chain.province}\n\n- **Originating concern:** ${chain.originating_concern}\n- **Key finding:** ${chain.key_finding}\n- **Recommendation or commitment:** ${chain.recommendation_or_commitment}\n- **Responsible organizations:** ${chain.responsible_organizations.join(", ")}\n- **Accountable actors:** ${chain.accountable_actors.join(", ")}\n- **Implementation action claimed:** ${chain.implementation_action_claimed}\n- **Public evidence of implementation:** ${chain.implementation_evidence}\n- **Current status:** ${chain.current_status.replaceAll("_", " ")}\n- **Unresolved gap:** ${chain.unresolved_gap}\n- **Contradictions / limits:** ${chain.contradictions_or_limitations}\n- **Best next document:** ${chain.best_next_document}\n- **Confidence:** ${chain.confidence}\n- **Evidence quality:** ${chain.evidence_quality}\n- **Sources:** ${chain.sources.map(source => `[${source.title}](${source.url}) — ${source.role}`).join("; ")}\n`).join("\n")}\n`
const changeReport = `# Accountability Watch change-detection example\n\nThis is a deterministic **example**, not a claim of a real-time development. It compares a deliberately incomplete prior snapshot with the current saved watch: the prior snapshot omits an existing FNHO Hansard source.\n\n- Meaningful example changes: ${example.meaningful_changes.length}\n- Suppressed review-only changes: ${example.suppressed_review_only_changes}\n\n${example.meaningful_changes.map(change => `- ${change.chain_id}: ${change.kind} — ${change.summary}`).join("\n")}\n\nA changed review date alone produces no alert. A new chain, a status change, a confidence change, or a newly attached public accountability document produces a reviewable alert.\n`
writeFileSync(new URL("miller-north-accountability-watch-v1-2026-09-07.md", dir), report)
writeFileSync(new URL("miller-north-accountability-watch-change-example-2026-09-07.json", dir), `${JSON.stringify({ simulated: true, purpose: "Example only; no factual update asserted.", result: example }, null, 2)}\n`)
writeFileSync(new URL("miller-north-accountability-watch-change-example-2026-09-07.md", dir), changeReport)
console.log(JSON.stringify({ chains: watch.chains.length, changeExamples: example.meaningful_changes.length }))
