export function visibleCurrentOpportunities(opportunities, now = new Date()) {
  return (opportunities || []).filter(opportunity => {
    if (opportunity.status !== "CURRENT_OPEN" || opportunity.procurementType === "RFI") return false
    return !opportunity.closingDate || new Date(opportunity.closingDate) >= now
  })
}
