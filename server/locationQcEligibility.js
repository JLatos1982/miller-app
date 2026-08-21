export function isLocationQcCanonicalEligible(resource) {
  return resource?.lifecycle_state === "active" && resource?.editorial_status !== "hidden"
}
