// Explicit owner-only local setup/rotation operator. It emits fingerprints
// only; raw credentials never enter source, files, logs, or stdout.
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { PREPARED_ACTION_ACTOR_ACCOUNT, PREPARED_ACTION_KEYCHAIN_SERVICE, PREPARED_ACTION_TRANSPORT_ACCOUNT } from '../server/preparedActionRuntimeCredentials.js'
const SAMWISE_PREPARED_ACTION_BRIDGE_KEYCHAIN_SERVICE = 'Samwise Prepared Action Bridge Runtime'
const SAMWISE_PREPARED_ACTION_BRIDGE_KEYCHAIN_ACCOUNT = 'mcp-bridge'

const url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const allowlist = new Set(String(process.env.ADMIN_EMAIL_ALLOWLIST || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
if (!url || !key || new URL(url).hostname !== 'wccagykzugrahwugefqt.supabase.co' || !allowlist.size) throw new Error('prepared_action_conveyor_target_or_actor_unavailable')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const users = await client.auth.admin.listUsers({ perPage: 1000 })
if (users.error) throw users.error
const actor = (users.data?.users || []).filter(user => allowlist.has(String(user.email || '').toLowerCase()))
if (actor.length !== 1) throw new Error('prepared_action_conveyor_actor_ambiguous')
const put = (service, account, value) => execFileSync('/usr/bin/security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', value], { stdio: 'ignore', timeout: 10000 })
const fingerprint = value => createHash('sha256').update(value).digest('hex').slice(0, 16)
const conveyorToken = randomBytes(32).toString('base64url'), bridgeToken = randomBytes(32).toString('base64url')
put(PREPARED_ACTION_KEYCHAIN_SERVICE, PREPARED_ACTION_TRANSPORT_ACCOUNT, conveyorToken)
put(PREPARED_ACTION_KEYCHAIN_SERVICE, PREPARED_ACTION_ACTOR_ACCOUNT, actor[0].id)
put(SAMWISE_PREPARED_ACTION_BRIDGE_KEYCHAIN_SERVICE, SAMWISE_PREPARED_ACTION_BRIDGE_KEYCHAIN_ACCOUNT, bridgeToken)
console.log(JSON.stringify({ target: 'wccagykzugrahwugefqt', miller_conveyor_token_fingerprint: fingerprint(conveyorToken), samwise_bridge_token_fingerprint: fingerprint(bridgeToken), actor_configured: true }))
