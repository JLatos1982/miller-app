import { mkdirSync, writeFileSync } from "node:fs"

import incidents from "../src/data/miller-north-serious-harm-public-v1.json" with { type: "json" }
import watch from "../src/data/miller-north-accountability-watch-v1.json" with { type: "json" }
import resources from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import legal from "../artifacts/miller-legal/miller-legal-evidence-review-v1.json" with { type: "json" }
import { buildFarmEvidenceGraph, suggestLegalSupportPathways } from "../server/farmEvidenceGraph.js"

const graph = buildFarmEvidenceGraph({ incidents: incidents.incidents, watchChains: watch.chains, resources: resources.records, legalRecords: legal.records })
const pathways = incidents.incidents.map(incident => ({ public_incident_id: incident.public_incident_id, ...suggestLegalSupportPathways({ record: incident, resources: resources.records }) })).filter(item => item.suggestions.length)
const output = { ...graph, pathway_suggestions: pathways, generated_at: new Date().toISOString(), owner_review_required: true }
const dir = new URL("../artifacts/farm-operations/", import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL("farm-evidence-graph-v1.json", dir), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ ...graph.counts, pathway_suggestions: pathways.reduce((sum, item) => sum + item.suggestions.length, 0), production_writes: 0, publication_writes: 0 }))
