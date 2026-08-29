import express from "express"
import { timingSafeEqual } from "node:crypto"

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
const tokenMatches = (actual, expected) => {
  const left = Buffer.from(String(actual || "")), right = Buffer.from(String(expected || ""))
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}
export const localPreparedPublicationAuthorized = ({ remoteAddress, token, expectedToken } = {}) => LOOPBACK.has(remoteAddress) && tokenMatches(token, expectedToken)

// This is deliberately a separate local listener, not a route on Miller's
// public Express application. Its only authority is this prepared-action
// conveyor; it cannot route arbitrary Miller operations.
export function createSamwisePreparedPublicationTransport({ conveyor, token } = {}) {
  if (!conveyor || typeof conveyor.list !== "function" || typeof conveyor.confirm !== "function" || !String(token || "")) throw new Error("samwise_prepared_publication_transport_dependencies_required")
  const app = express()
  app.disable("x-powered-by")
  app.use(express.json({ limit: "1kb", strict: true }))
  app.use((req, res, next) => {
    if (!localPreparedPublicationAuthorized({ remoteAddress: req.socket.remoteAddress, token: req.get("x-miller-samwise-conveyor"), expectedToken: token })) return res.status(403).json({ error: "local_conveyor_unauthorized" })
    res.setHeader("Cache-Control", "no-store")
    return next()
  })
  app.get("/v1/prepared-publication-actions", (_req, res) => res.json({ actions: conveyor.list() }))
  app.post("/v1/prepared-publication-actions/confirm", async (req, res) => {
    const body = req.body
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 2 || typeof body.prepared_action_id !== "string" || body.owner_confirmed !== true) return res.status(400).json({ error: "prepared_action_confirmation_invalid" })
    try { return res.json(await conveyor.confirm(body)) } catch { return res.status(503).json({ outcome: "failed_validation" }) }
  })
  app.use((_req, res) => res.status(404).json({ error: "local_conveyor_operation_unknown" }))
  return app
}
