export function parseAdminEmailAllowlist(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function getBearerToken(headerValue) {
  const match = String(headerValue || "").match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] || ""
}

export function createRequireAdmin({ supabase, getAllowlist = () => process.env.ADMIN_EMAIL_ALLOWLIST }) {
  return async function requireAdmin(req, res, next) {
    const token = getBearerToken(req.headers?.authorization)
    if (!token) return res.status(401).json({ error: "Unauthorized" })

    const allowlist = parseAdminEmailAllowlist(getAllowlist())
    if (!allowlist.size) return res.status(503).json({ error: "Administrator access is not configured." })

    try {
      const { data, error } = await supabase.auth.getUser(token)
      const email = String(data?.user?.email || "").trim().toLowerCase()
      if (error || !data?.user || !allowlist.has(email)) {
        return res.status(403).json({ error: "Forbidden" })
      }

      req.adminUser = { id: data.user.id, email }
      res.setHeader("Cache-Control", "private, no-store")
      return next()
    } catch {
      return res.status(401).json({ error: "Unauthorized" })
    }
  }
}
