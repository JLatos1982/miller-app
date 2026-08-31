import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const baseline = join(root, "supabase", "baselines", "miller-schema-baseline-v1", "schema.sql")
const epoch = "202608690001"
const args = process.argv.slice(2)
let workdir = process.cwd()

if (args.length === 2 && args[0] === "--workdir") workdir = resolve(args[1])
else if (args.length !== 0) throw new Error("usage: node scripts/apply-miller-schema-baseline-v1.mjs [--workdir PATH]")

const config = readFileSync(join(workdir, "supabase", "config.toml"), "utf8")
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)?.[1]
if (!projectId) throw new Error("local Supabase project_id is required")
const databaseContainer = `supabase_db_${projectId}`

function run(command, args) {
  const result = spawnSync(command, args, { cwd: workdir, encoding: "utf8" })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) throw new Error(`baseline command failed: ${command} ${args.join(" ")}`)
  return result.stdout
}

// This intentionally targets only a fresh local stack. It never links to,
// queries, or mutates a remote project.
const hasApplicationRelations = run("docker", ["exec", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-Atqc", "select exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','miller_internal') and c.relkind in ('r','p','v','m','S'))"])
if (hasApplicationRelations.trim() !== "f") throw new Error("miller_schema_baseline_v1_requires_empty_local_database")

// A new local project grants these privileges by default. Production's schema
// dump records only its explicit grants, so remove the local defaults before
// replay; the dump restores production's intended default-privilege posture.
run("docker", ["exec", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
  "-c", "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role",
  "-c", "alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role",
  "-c", "alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role"
])

function apply(file, target) {
  run("docker", ["cp", file, `${databaseContainer}:${target}`])
  run("docker", ["exec", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", target])
  run("docker", ["exec", databaseContainer, "rm", "-f", target])
}

apply(baseline, "/tmp/miller-schema-baseline-v1.sql")

const postEpoch = readdirSync(join(root, "supabase", "migrations"))
  .filter((name) => /^\d+_.+\.sql$/.test(name) && name.slice(0, 12) > epoch)
  .sort()

for (const name of postEpoch) apply(join(root, "supabase", "migrations", name), `/tmp/${name}`)

console.log(JSON.stringify({
  outcome: "miller_schema_baseline_v1_applied_local_only",
  epoch,
  post_epoch_migrations_applied: postEpoch
}))
