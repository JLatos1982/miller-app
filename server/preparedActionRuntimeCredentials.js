import { execFileSync } from "node:child_process"

export const PREPARED_ACTION_KEYCHAIN_SERVICE = "Miller Prepared Action Conveyor Runtime"
export const PREPARED_ACTION_TRANSPORT_ACCOUNT = "transport"
export const PREPARED_ACTION_ACTOR_ACCOUNT = "actor"
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""))
function read(account, valid, run = execFileSync) {
  try { const value = String(run("/usr/bin/security", ["find-generic-password", "-w", "-s", PREPARED_ACTION_KEYCHAIN_SERVICE, "-a", account], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }) || "").trim(); return valid(value) ? value : null } catch { return null }
}
export const readPreparedActionTransportToken = run => read(PREPARED_ACTION_TRANSPORT_ACCOUNT, value => /^[A-Za-z0-9_-]{32,}$/.test(value), run)
export const readPreparedActionActorId = run => read(PREPARED_ACTION_ACTOR_ACCOUNT, uuid, run)
