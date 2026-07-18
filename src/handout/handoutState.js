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

export const HANDOUT_IDENTITY_FIELDS = ["preparedBy", "organizationName", "roleOrProgram", "contactPhone", "contactEmail", "address", "website", "note"]

export function createInitialHandoutState() {
  return {
    fields: {
      title: "Personalized Community Resources",
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
    identity: {
      preparedBy: "", organizationName: "", roleOrProgram: "", contactPhone: "", contactEmail: "",
      address: "", website: "", note: "", includeMillerAttribution: false,
      logo: { dataUrl: "", name: "", visible: true, size: "medium", alignment: "left" },
    },
    resources: [],
  }
}

export function getResourceKey(resource) {
  if (resource?.key) return resource.key
  if (resource?.id !== undefined && resource?.id !== null) return `id:${resource.id}`
  return [resource?.website, resource?.name, resource?.city, resource?.organization]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|")
}

function copyResource(resource) {
  const originalDescription = String(resource.description || "")
  return {
    type: "miller-resource",
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
    case "add_temporary_resource": {
      const resource = action.resource
      if (!resource?.key || resource.type !== "temporary-resource") return state
      const duplicate = state.resources.some((item) => item.key === resource.key || (resource.sourceKey && item.sourceKey === resource.sourceKey))
      if (duplicate) return state
      return { ...state, resources: [...state.resources, { ...resource }] }
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
    case "update_identity":
      if (!HANDOUT_IDENTITY_FIELDS.includes(action.field)) return state
      return { ...state, identity: { ...state.identity, [action.field]: String(action.value ?? "") } }
    case "toggle_miller_attribution":
      return { ...state, identity: { ...state.identity, includeMillerAttribution: Boolean(action.value) } }
    case "set_logo":
      return { ...state, identity: { ...state.identity, logo: { dataUrl: String(action.dataUrl || ""), name: String(action.name || ""), visible: true, size: "medium", alignment: "left" } } }
    case "remove_logo":
      return { ...state, identity: { ...state.identity, logo: { dataUrl: "", name: "", visible: true, size: "medium", alignment: "left" } } }
    case "update_logo_option":
      if (!['visible', 'size', 'alignment'].includes(action.field)) return state
      if (action.field === "size" && !['small', 'medium', 'large'].includes(action.value)) return state
      if (action.field === "alignment" && !['left', 'center', 'right'].includes(action.value)) return state
      return { ...state, identity: { ...state.identity, logo: { ...state.identity.logo, [action.field]: action.field === "visible" ? Boolean(action.value) : action.value } } }
    case "update_resource":
      if (!["handoutDescription", "handoutNote", "name", "organization", "category", "city", "serviceArea", "address", "phone", "email", "website", "hours", "eligibility", "referralProcess", "cost", "accessibility", "languages", "limitations", "callBeforeNote", "verificationStatus", "showVerificationNote"].includes(action.field)) return state
      return {
        ...state,
        resources: state.resources.map((resource) => resource.key === action.key
          ? { ...resource, [action.field]: action.field === "showVerificationNote" ? Boolean(action.value) : String(action.value ?? "") }
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
  if (HANDOUT_FIELD_NAMES.some((field) => state.fields[field] !== defaults[field])) return true
  return HANDOUT_IDENTITY_FIELDS.some((field) => state.identity[field]) || state.identity.includeMillerAttribution || Boolean(state.identity.logo.dataUrl)
}
