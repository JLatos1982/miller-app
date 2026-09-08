import listenerRegistry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }
import { samwiseListenerInventory } from "./samwiseCapabilityRegistry.js"
import { normalizeSamwiseSourceFamily } from "./samwisePublicRecordsIntelligence.js"

const FAMILY_DOMAINS = Object.freeze({
  coroners_inquests: ["healthcare", "policing", "corrections", "public_safety"],
  fatality_inquiries: ["healthcare", "public_safety", "child_youth", "transportation"],
  healthcare_regulators: ["healthcare", "professional_regulation", "human_rights"],
  professional_regulators: ["professional_regulation", "healthcare", "human_rights"],
  courts: ["courts_legal", "human_rights", "government_services", "housing"],
  human_rights_tribunals: ["human_rights", "healthcare", "housing", "government_services"],
  judicial_reviews: ["courts_legal", "human_rights", "professional_regulation"],
  police_oversight: ["policing", "public_safety", "healthcare", "human_rights"],
  corrections_oversight: ["corrections", "healthcare", "human_rights", "government_services"],
  child_youth_advocates: ["child_youth", "healthcare", "government_services", "public_funding"],
  ombuds_offices: ["government_services", "human_rights"],
  government_audits: ["government_services", "public_funding"],
  legislative_government_reports: ["government_services", "public_funding"],
  recommendation_response_trackers: ["government_services", "healthcare", "child_youth"],
  indigenous_led_organizations: ["healthcare", "human_rights", "government_services"],
  public_funding_programs: ["public_funding", "government_services"],
  administrative_appeals: ["courts_legal", "government_services", "human_rights"],
  workplace_safety_enforcement: ["public_safety", "courts_legal", "professional_regulation", "government_services"],
  institutional_statements: ["other_public_institution", "healthcare", "public_safety"],
})

export function buildSamwisePublicRecordSourceRegistry(registry = listenerRegistry) {
  const inventory = samwiseListenerInventory({ listeners: registry })
  const sources = inventory.listeners.map(listener => {
    const family = normalizeSamwiseSourceFamily(listener.source_family)
    return {
      source_id: `samwise:${listener.listener_id}`,
      legacy_listener_id: listener.listener_id,
      source_family: family,
      adapter_source_family: listener.source_family,
      jurisdiction: listener.jurisdiction,
      public_index: listener.source_url,
      adapter: listener.adapter,
      supported_domains: FAMILY_DOMAINS[family] || ["other_public_institution"],
      schedule: listener.schedule,
      enabled: listener.enabled,
      execution_target: listener.execution_target,
      consumer_hints: listener.consumer_hints,
      source_yield_class: listener.yield_class,
      privacy_class: "owner_private_metadata",
      mutation_authority: false,
      publication_authority: false,
    }
  })
  return {
    schema_version: "samwise-public-record-source-registry-v1",
    capability_id: inventory.capability_id,
    generated_at: registry.generated_at,
    scheduler: inventory.scheduler,
    sources,
    counts: {
      sources: sources.length,
      enabled: sources.filter(source => source.enabled).length,
      disabled: sources.filter(source => !source.enabled).length,
      source_families: new Set(sources.map(source => source.source_family)).size,
    },
    mutation_authority: false,
    publication_authority: false,
  }
}

export function validateSamwisePublicRecordSourceRegistry(registry) {
  if (registry?.schema_version !== "samwise-public-record-source-registry-v1" || !Array.isArray(registry.sources)) throw new Error("samwise_source_registry_invalid")
  const ids = new Set()
  for (const source of registry.sources) {
    if (!source.source_id || ids.has(source.source_id) || !source.source_family || !source.adapter || !Array.isArray(source.supported_domains)) throw new Error("samwise_source_registry_invalid")
    if (!/^https:\/\//.test(source.public_index) && !/^local:\/\//.test(source.public_index)) throw new Error("samwise_source_registry_public_index_invalid")
    if (source.mutation_authority !== false || source.publication_authority !== false) throw new Error("samwise_source_registry_authority_invalid")
    ids.add(source.source_id)
  }
  return { valid: true, sources: ids.size, enabled: registry.sources.filter(source => source.enabled).length, disabled: registry.sources.filter(source => !source.enabled).length }
}
