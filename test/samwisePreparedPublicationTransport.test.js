import test from "node:test"
import assert from "node:assert/strict"
import { createSamwisePreparedPublicationTransport, localPreparedPublicationAuthorized } from "../server/samwisePreparedPublicationTransport.js"

test("local conveyor allows only loopback requests with its dedicated credential", () => {
  const token = "x".repeat(40)
  assert.equal(localPreparedPublicationAuthorized({ remoteAddress: "127.0.0.1", token, expectedToken: token }), true)
  assert.equal(localPreparedPublicationAuthorized({ remoteAddress: "::1", token, expectedToken: token }), true)
  assert.equal(localPreparedPublicationAuthorized({ remoteAddress: "10.0.0.6", token, expectedToken: token }), false)
  assert.equal(localPreparedPublicationAuthorized({ remoteAddress: "127.0.0.1", token: "wrong", expectedToken: token }), false)
  assert.throws(() => createSamwisePreparedPublicationTransport({ token: "", conveyor: {} }), /dependencies_required/)
})
