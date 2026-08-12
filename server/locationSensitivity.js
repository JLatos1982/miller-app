const hard = /confidential|undisclosed|private residence|residential treatment|recovery house|supportive housing|transitional housing|shelter|safe house|mobile-only|virtual-only|service-area-only/i
const parent = /housing|shelter|women|youth|residential/i
const publicType = /storefront|thrift|shop|clinic|health cent|community cent|administrative office|public office|pharmacy/i

export function assessLocationSensitivity({ program = {}, location = {}, facility = {}, parentOrganization = {} } = {}) {
  const specific = `${program.name || ""} ${program.description || ""} ${location.label || ""} ${location.disclosure || ""} ${facility.type || ""}`
  const parentText = `${parentOrganization.name || ""} ${parentOrganization.activities || ""}`
  const hardExclusion = hard.test(specific) || ["virtual", "mobile", "service_area", "confidential", "undisclosed"].includes(location.type)
  const clearlyPublic = publicType.test(`${specific} ${facility.public_use || ""}`) && location.publiclyAdvertised === true
  return { specific_program_public: clearlyPublic && !hardExclusion, specific_location_public: clearlyPublic && !hardExclusion, hard_exclusion: hardExclusion, parent_organization_warning: parent.test(parentText), reason: hardExclusion ? "Specific program/location is unsuitable for an exact public point." : clearlyPublic ? "Specific program/location is a publicly advertised non-residential facility." : "Specific program/location requires human review." }
}
