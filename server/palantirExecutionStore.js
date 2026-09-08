import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

const VERSION = "palantir-execution-store-v1"
const empty = () => ({ schema_version: VERSION, plans: [], executions: [], updated_at: null, production_data_mutations: 0, publication_actions: 0 })

export function readPalantirExecutionStore(filePath) {
  if (!existsSync(filePath)) return empty()
  const value = JSON.parse(readFileSync(filePath, "utf8"))
  if (value?.schema_version !== VERSION || !Array.isArray(value.plans) || !Array.isArray(value.executions)) throw new Error("palantir_execution_store_invalid")
  return value
}

function atomicWrite(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, filePath)
}

export function persistPalantirPlan(filePath, plan, { now = new Date() } = {}) {
  if (plan?.schema_version !== "palantir-supervised-research-plan-v1") throw new Error("palantir_plan_invalid")
  const store = readPalantirExecutionStore(filePath)
  const next = { ...store, plans: [...store.plans.filter(item => item.plan_id !== plan.plan_id), plan], updated_at: new Date(now).toISOString() }
  atomicWrite(filePath, next)
  return next
}

export function persistPalantirExecution(filePath, execution, { now = new Date() } = {}) {
  if (execution?.schema_version !== "palantir-research-execution-v1") throw new Error("palantir_execution_invalid")
  const store = readPalantirExecutionStore(filePath)
  const prior = store.executions.find(item => item.execution_id === execution.execution_id)
  const completed = new Set((prior?.source_checkpoints || []).filter(item => ["completed", "no_material_change"].includes(item.status)).map(item => item.source_id))
  if (execution.source_checkpoints.some(item => completed.has(item.source_id) && !["completed", "no_material_change"].includes(item.status))) throw new Error("palantir_checkpoint_regression")
  const next = { ...store, executions: [...store.executions.filter(item => item.execution_id !== execution.execution_id), execution], updated_at: new Date(now).toISOString() }
  atomicWrite(filePath, next)
  return next
}
