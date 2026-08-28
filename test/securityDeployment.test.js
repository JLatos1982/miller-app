import test from "node:test"
import assert from "node:assert/strict"
import { MILLER_SECURITY_PROFILE } from "../server/millerSecurityProfile.js"
import { deploymentAlignment, inspectDeploymentConsistency, inspectRuntimeEnvironment, inspectSchedulerPosture } from "../server/securityDeployment.js"
import { correlateSecurityEvidence } from "../server/securityCorrelation.js"

const version = { git_sha: "b22459b" }
const completeSchema = { migration_head: "202608610001", contract: "miller-security-deployment-contract-v1", capabilities: ["security_core_registry", "security_incident_correlation", "deployment_observation_ledger"] }

test("deployment contract distinguishes aligned, unknown, ahead, behind, and missing capability states", () => {
  assert.equal(deploymentAlignment({ profile: MILLER_SECURITY_PROFILE, version, schema: completeSchema }).state, "aligned")
  assert.equal(deploymentAlignment({ profile: MILLER_SECURITY_PROFILE, version: {}, schema: completeSchema }).state, "build_unknown")
  assert.equal(deploymentAlignment({ profile: MILLER_SECURITY_PROFILE, version, schema: {} }).state, "schema_unknown")
  assert.equal(deploymentAlignment({ profile: MILLER_SECURITY_PROFILE, version, schema: { ...completeSchema, migration_head: "202608590001" } }).state, "schema_behind_build")
  assert.equal(deploymentAlignment({ profile: MILLER_SECURITY_PROFILE, version, schema: { ...completeSchema, capabilities: [] } }).state, "migration_gap")
  assert.equal(deploymentAlignment({ profile: MILLER_SECURITY_PROFILE, version, schema: { ...completeSchema, migration_head: "202608620001" } }).state, "schema_ahead_of_build")
})

test("deployment and runtime posture are passive, bounded, and fail closed", () => {
  const mismatch = inspectDeploymentConsistency({ profile: MILLER_SECURITY_PROFILE, version, schema: { ...completeSchema, capabilities: [] } })
  assert.equal(mismatch.state, "unavailable")
  assert.equal(mismatch.findings[0].severity, "high")
  const environment = inspectRuntimeEnvironment({ profile: MILLER_SECURITY_PROFILE, environment: { supabase_url: true, supabase_service_role: true, local_sentinel_enabled: true } })
  assert.equal(environment.state, "failed")
  assert.match(environment.findings[0].finding_type, /forbidden_local_sentinel_enabled/)
  const scheduler = inspectSchedulerPosture({ profile: MILLER_SECURITY_PROFILE, scheduler: { enabled: true, schema_available: false, heartbeat_freshness: "stale" } })
  assert.equal(scheduler.state, "failed")
  assert.ok(scheduler.findings.some((item) => item.finding_type === "scheduler_enabled_without_schema"))
})

test("deployment mismatch is correlated without a causal claim", () => {
  const finding = inspectDeploymentConsistency({ profile: MILLER_SECURITY_PROFILE, version, schema: { ...completeSchema, migration_head: "202608590001" } }).findings[0]
  const incidents = correlateSecurityEvidence({ findings: [finding] })
  assert.equal(incidents[0].category, "deployment")
  assert.doesNotMatch(JSON.stringify(incidents), /caused|cause/i)
})
