import { HEALTH_CANADA } from "./healthCanadaAdapter.js"
import { BC_PUBLIC_HEALTH_SENSORS } from "./bcPublicHealthSensors.js"
import { freshness } from "./operationalGuidance.js"

export const PUBLIC_HEALTH_SOURCES = Object.freeze([
  { id: HEALTH_CANADA.id, organization: "Health Canada", type: "alert_dataset", region: "Canada", retrieval: "fixed_live_ready", external_request_required: true, freshness_ms: 48 * 60 * 60 * 1000, parser_version: HEALTH_CANADA.parserVersion, max_records: HEALTH_CANADA.maxRecords, lifecycle: "stable_source_record" },
  ...BC_PUBLIC_HEALTH_SENSORS.map((sensor) => ({ id: sensor.id, organization: sensor.authority, type: sensor.acute ? "alert" : "dataset", region: "British Columbia", retrieval: sensor.mode, external_request_required: sensor.mode === "live_ready", freshness_ms: sensor.acute ? 12 * 60 * 60 * 1000 : 35 * 24 * 60 * 60 * 1000, parser_version: "fixture-contract-v1", max_records: 100, lifecycle: sensor.acute ? "alert_like" : "dataset_release" })),
])

export function publicHealthSourceStatus(checkpoints = [], now = Date.now()) {
  const byId = new Map(checkpoints.map((item) => [item.sensor_id, item]))
  return PUBLIC_HEALTH_SOURCES.map((source) => {
    const checkpoint = byId.get(source.id)
    const status = freshness({ lastSuccessAt: checkpoint?.last_success_at, status: checkpoint?.health_state || (source.retrieval.includes("fixture") ? "fixture_validated_live_disabled" : "unknown"), maxAgeMs: source.freshness_ms, now })
    return { id: source.id, organization: source.organization, type: source.type, region: source.region, status, retrieval: source.retrieval, external_request_required: source.external_request_required, last_success_at: checkpoint?.last_success_at || null, parser_version: source.parser_version, lifecycle: source.lifecycle }
  })
}
