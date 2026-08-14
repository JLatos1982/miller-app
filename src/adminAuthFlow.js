export const ADMIN_CALLBACK_PATH = "/admin"

export function getAdminRedirectUrl(origin) {
  const trustedOrigin = new URL(origin).origin
  return new URL(ADMIN_CALLBACK_PATH, trustedOrigin).toString()
}

export function hasAuthCallbackParams(locationLike = window.location) {
  const hash = String(locationLike.hash || "")
  const search = String(locationLike.search || "")
  return /(?:^|[&#])(access_token|refresh_token|error|error_code|error_description)=/.test(hash)
    || /(?:^|[?&])(code|token_hash|error|error_code|error_description)=/.test(search)
}

export function clearAuthCallbackFromUrl(historyLike = window.history, locationLike = window.location) {
  if (!hasAuthCallbackParams(locationLike)) return false
  historyLike.replaceState(historyLike.state, "", ADMIN_CALLBACK_PATH)
  return true
}

export async function requestAdminMagicLink({ supabase, email, origin }) {
  return supabase.auth.signInWithOtp({
    email: String(email || "").trim(),
    options: {
      emailRedirectTo: getAdminRedirectUrl(origin),
      shouldCreateUser: false,
    },
  })
}
