const RELATED_SUPPORT_CATEGORIES = Object.freeze({
  housing: ["income_benefits", "advocacy_navigation"],
  employment: ["training", "transportation"],
  training: ["employment", "transportation"],
  identification: ["income_benefits", "housing"],
  income_benefits: ["housing", "identification"],
  transportation: ["advocacy_navigation", "employment"],
  advocacy_navigation: ["housing", "identification"],
  basic_needs: ["housing", "income_benefits"],
})

const FUNDING_PURPOSES = Object.freeze({
  housing: ["housing", "moving_transportation"],
  employment: ["employment_training", "training"],
  training: ["training", "employment_training", "education"],
  identification: ["identification"],
  income_benefits: ["income_benefits", "emergency_assistance"],
  transportation: ["transportation", "moving_transportation", "treatment_transportation"],
  advocacy_navigation: [],
  basic_needs: ["emergency_assistance", "income_benefits"],
})

const STATUS_PRIORITY = Object.freeze({ open: 0, recurring: 1, upcoming: 2, contact_to_confirm: 3, verify_before_applying: 4, closed: 5, archived: 6 })

export function relatedSupportCategories(category) {
  return [...(RELATED_SUPPORT_CATEGORIES[category] || [])]
}

export function relatedFundingRecords(records, category, limit = 2) {
  const purposes = FUNDING_PURPOSES[category] || []
  return records
    .filter(record => purposes.includes(record.purpose) && !["closed", "archived"].includes(record.status))
    .sort((a, b) => purposes.indexOf(a.purpose) - purposes.indexOf(b.purpose) || (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9) || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit))
}
