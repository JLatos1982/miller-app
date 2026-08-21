import fs from "node:fs"
import { locationDryRun } from "../server/intelligence/locationAutomation.js"
import { recheckPriority } from "../server/intelligence/maintenance.js"
const source = JSON.parse(fs.readFileSync(new URL("../data/location-automation-v1.2.1-review.json", import.meta.url), "utf8"))
const resources = JSON.parse(fs.readFileSync(new URL("../src/vancouver_resources_merged_updated.json", import.meta.url), "utf8"))
const report = locationDryRun(source.records || [])
const maintenanceSample = resources.slice(0, 25).map((resource) => ({ name: resource.name, phonePresent: Boolean(resource.phone), websitePresent: Boolean(resource.website), phoneRecheck: recheckPriority({ field: "phone", lastVerifiedAt: resource.last_verified_at }), websiteRecheck: recheckPriority({ field: "website", lastVerifiedAt: resource.last_verified_at }) }))
console.log(JSON.stringify({ mode: report.mode, candidatesEvaluated: report.candidatesEvaluated, counts: report.counts, automationRate: report.automationRate, reviewReasons: report.reviewReasons, maintenanceSample: { examined: maintenanceSample.length, newEvidenceRetrieved: 0, changesDetected: 0, recheckNeededBeforeChangeDecision: maintenanceSample.filter((item) => item.phoneRecheck.priority !== "low" || item.websiteRecheck.priority !== "low").length, reason: "Local trusted records do not contain new independent source snapshots; absence of retrieval is unknown, not a change." } }, null, 2))
