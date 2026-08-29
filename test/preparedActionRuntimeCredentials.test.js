import test from "node:test"
import assert from "node:assert/strict"
import { PREPARED_ACTION_ACTOR_ACCOUNT, PREPARED_ACTION_KEYCHAIN_SERVICE, PREPARED_ACTION_TRANSPORT_ACCOUNT, readPreparedActionActorId, readPreparedActionTransportToken } from "../server/preparedActionRuntimeCredentials.js"

test("prepared-action runtime credentials use distinct Keychain accounts and validate their shape", () => {
  const calls = [], run = (_bin, args) => { calls.push(args); return args.at(-1) === PREPARED_ACTION_ACTOR_ACCOUNT ? "11111111-1111-4111-8111-111111111111" : "a".repeat(40) }
  assert.equal(readPreparedActionTransportToken(run), "a".repeat(40)); assert.equal(readPreparedActionActorId(run), "11111111-1111-4111-8111-111111111111")
  assert.deepEqual(calls.map(args => args.slice(-4)), [["-s", PREPARED_ACTION_KEYCHAIN_SERVICE, "-a", PREPARED_ACTION_TRANSPORT_ACCOUNT], ["-s", PREPARED_ACTION_KEYCHAIN_SERVICE, "-a", PREPARED_ACTION_ACTOR_ACCOUNT]])
  assert.equal(readPreparedActionActorId(() => "not-a-uuid"), null)
})
