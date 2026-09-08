import capabilityRegistry from "../src/data/samwise-capability-registry-v1.json" with { type: "json" }
import listenerRegistry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }
import { validateFarmListenerRegistry } from "./farmListenerFramework.js"
import { FARM_IGOR_CAPABILITIES } from "./farmIgorWorker.js"
import { adaptFarmListenerToSamwise, SAMWISE_OUTPUT_ROUTES, SAMWISE_PUBLIC_RECORD_DOMAINS, SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID, SAMWISE_SOURCE_FAMILIES } from "./samwisePublicRecordsIntelligence.js"

const sameMembers = (left, right) => left.length === right.length && left.every(item => right.includes(item))

export function validateSamwiseCapabilityRegistry(registry = capabilityRegistry) {
  if (registry?.schema_version !== "samwise-capability-registry-v1" || !Array.isArray(registry.capabilities)) throw new Error("samwise_capability_registry_invalid")
  const ids = new Set()
  for (const capability of registry.capabilities) {
    if (!capability.capability_id || ids.has(capability.capability_id)) throw new Error("samwise_capability_id_invalid")
    if (capability.owner !== "samwise" || capability.mutation_authority !== false || capability.publication_authority !== false) throw new Error("samwise_capability_authority_invalid")
    if (!sameMembers(capability.supported_domains, SAMWISE_PUBLIC_RECORD_DOMAINS)) throw new Error("samwise_capability_domains_invalid")
    if (!sameMembers(capability.source_families, SAMWISE_SOURCE_FAMILIES)) throw new Error("samwise_capability_source_families_invalid")
    if ((capability.worker_requirements?.igor_capabilities || []).some(item => !FARM_IGOR_CAPABILITIES.includes(item))) throw new Error("samwise_capability_igor_capability_invalid")
    ids.add(capability.capability_id)
  }
  return { valid: true, capabilities: ids.size }
}

export function samwisePublicRecordsCapability(registry = capabilityRegistry) {
  validateSamwiseCapabilityRegistry(registry)
  const capability = registry.capabilities.find(item => item.capability_id === SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID)
  if (!capability) throw new Error("samwise_public_records_capability_missing")
  return capability
}

export function samwiseListenerInventory({ capabilities = capabilityRegistry, listeners = listenerRegistry } = {}) {
  validateFarmListenerRegistry(listeners)
  const capability = samwisePublicRecordsCapability(capabilities)
  const integrated = listeners.listeners.map(listener => adaptFarmListenerToSamwise(listener, capability.listener_source_families)).filter(Boolean)
  return {
    capability_id: capability.capability_id,
    display_name: capability.name,
    qualified_name: capability.qualified_name || capability.name,
    scheduler: capability.scheduler,
    listeners: integrated,
    counts: {
      registered: integrated.length,
      enabled: integrated.filter(item => item.enabled).length,
      disabled: integrated.filter(item => !item.enabled).length,
      samwise: integrated.filter(item => item.execution_target === "samwise").length,
      igor: integrated.filter(item => item.execution_target === "igor").length,
    },
    output_routes: SAMWISE_OUTPUT_ROUTES,
    mutation_authority: false,
    publication_authority: false,
  }
}
