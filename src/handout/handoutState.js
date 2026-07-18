export const HANDOUT_FIELD_NAMES = [
  "title",
  "subtitle",
  "personName",
  "date",
  "location",
  "generalNotes",
  "nextSteps",
  "followUp",
  "staffContact",
  "footerNote",
]

export function createInitialHandoutState() {
  return {
    fields: {
      title: "My Resource Handout",
      subtitle: "",
      personName: "",
      date: new Date().toISOString().slice(0, 10),
      location: "",
      generalNotes: "",
      nextSteps: "",
      followUp: "",
      staffContact: "",
      footerNote: "",
    },
    resources: [],
  }
}

export function getResourceKey(resource) {
  if (resource?.id !== undefined && resource?.id !== null) return `id:${resource.id}`
  return [resource?.website, resource?.name, resource?.city, resource?.organization]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|")
}

function copyResource(resource) {
  const originalDescription = String(resource.description || "")
  return {
    key: getResourceKey(resource),
    name: String(resource.name || "Unnamed Resource"),
    organization: String(resource.organization || ""),
    category: String(resource.category || ""),
    serviceType: String(resource.serviceType || resource.service_type || ""),
    city: String(resource.city || ""),
    region: String(resource.region || ""),
    phone: String(resource.phone || ""),
    altPhone: String(resource.altPhone || ""),
    email: String(resource.email || ""),
    website: String(resource.website || ""),
    address: String(resource.address || ""),
    eligibility: String(resource.eligibility || ""),
    population: String(resource.population || ""),
    hours: String(resource.hours || ""),
    accessType: String(resource.accessType || ""),
    originalDescription,
    handoutDescription: originalDescription,
    handoutNote: "",
  }
}

function moveResource(resources, index, direction) {
  const destination = index + direction
  if (index < 0 || destination < 0 || destination >= resources.length) return resources
  const next = [...resources]
  ;[next[index], next[destination]] = [next[destination], next[index]]
  return next
}

export function handoutReducer(state, action) {
  switch (action.type) {
    case "add_resource": {
      const key = getResourceKey(action.resource)
      if (!key || state.resources.some((resource) => resource.key === key)) return state
      return { ...state, resources: [...state.resources, copyResource(action.resource)] }
    }
    case "remove_resource":
      return { ...state, resources: state.resources.filter((resource) => resource.key !== action.key) }
    case "move_resource": {
      const index = state.resources.findIndex((resource) => resource.key === action.key)
      return { ...state, resources: moveResource(state.resources, index, action.direction) }
    }
    case "update_field":
      if (!HANDOUT_FIELD_NAMES.includes(action.field)) return state
      return { ...state, fields: { ...state.fields, [action.field]: String(action.value ?? "") } }
    case "update_resource":
      if (!["handoutDescription", "handoutNote"].includes(action.field)) return state
      return {
        ...state,
        resources: state.resources.map((resource) => resource.key === action.key
          ? { ...resource, [action.field]: String(action.value ?? "") }
          : resource),
      }
    case "restore_description":
      return {
        ...state,
        resources: state.resources.map((resource) => resource.key === action.key
          ? { ...resource, handoutDescription: resource.originalDescription }
          : resource),
      }
    case "clear":
      return createInitialHandoutState()
    default:
      return state
  }
}

export function hasHandoutContent(state) {
  if (state.resources.length) return true
  const defaults = createInitialHandoutState().fields
  return HANDOUT_FIELD_NAMES.some((field) => state.fields[field] !== defaults[field])
}

