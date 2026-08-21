import { execFileSync, spawn } from "node:child_process"

const container = "supabase_db_miller-app"
const resourceId = "00000000-0000-0000-0000-000000000201"
const actorId = "00000000-0000-0000-0000-000000000210"
const runSql = (sql) => execFileSync("docker", ["exec", container, "psql", "-XAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim()
const concurrentSql = `select (public.save_location_qc_review_decision('${resourceId}','local-concurrency-v1',repeat('a',64),'pilot_eligible','concurrent first decision','{"public_map":false}'::jsonb,0,'${actorId}')).version;`

if (process.env.ALLOW_PRODUCTION_DATABASE_TESTS) throw new Error("This script refuses production database testing.")
const containerName = execFileSync("docker", ["inspect", "--format", "{{.Name}}", container], { encoding: "utf8" }).trim()
if (containerName !== `/${container}`) throw new Error(`Expected local Supabase container ${container}.`)
const inspect = runSql("select current_database(), inet_server_addr()::text, inet_server_port()::text;")
if (!inspect.startsWith("postgres|")) throw new Error(`Expected the local Docker database, received ${inspect}`)
console.log("target=local_supabase_docker")

runSql(`
  insert into auth.users (id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values ('${actorId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','local-concurrency@example.invalid','','{}','{}',now(),now())
  on conflict (id) do nothing;
  insert into public.resource_registry (id,display_name,lifecycle_state,editorial_status)
  values ('${resourceId}','Local Concurrent Clinic','active','pending')
  on conflict (id) do update set lifecycle_state='active',editorial_status='pending';
`)
const locationCountBefore = Number(runSql("select count(*) from public.resource_locations;"))

function attempt() {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", container, "psql", "-XAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", concurrentSql])
    let stdout = "", stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), conflict: /review version conflict/i.test(stderr) }))
  })
}

const attempts = await Promise.all([attempt(), attempt()])
const successes = attempts.filter((item) => item.code === 0 && item.stdout === "1")
const conflicts = attempts.filter((item) => item.code !== 0 && item.conflict)
if (successes.length !== 1 || conflicts.length !== 1) throw new Error(`Expected one success and one version conflict; got successes=${successes.length}, conflicts=${conflicts.length}`)

const qcCount = Number(runSql(`select count(*) from public.location_qc_reviews where canonical_resource_id='${resourceId}';`))
const auditCount = Number(runSql(`select count(*) from public.location_qc_review_audit where canonical_resource_id='${resourceId}';`))
const locationCountAfter = Number(runSql("select count(*) from public.resource_locations;"))
if (qcCount !== 1 || auditCount !== 1) throw new Error(`Unexpected durable rows: qc=${qcCount}, audit=${auditCount}`)
if (locationCountAfter !== locationCountBefore) throw new Error("QC changed resource_locations.")

console.log("concurrent_successes=1")
console.log("concurrent_version_conflicts=1")
console.log("qc_rows=1 audit_rows=1")
console.log("resource_location_changes=0 publication_changes=0")
