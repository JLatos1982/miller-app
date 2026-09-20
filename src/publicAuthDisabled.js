// Public Miller has no authenticated or database-backed browser capability.
export const supabase = Object.freeze({
  auth: Object.freeze({ signOut: async () => ({ error: null }) }),
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
})
