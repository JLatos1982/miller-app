# Public Funding Data-Field Assessment

Date: 2026-09-06

## Finding

Public funding is useful but cannot be represented safely as one amount on a service. The existing 15 policy-to-service records contain quantities and program relationships, but no normalized public dollar amount. This pass does not infer any amount from broader budgets or announcements.

## Recommended private observation fields

- `funding_observation_id`
- `announced_amount_cad`
- `amount_scope_summary`
- `funding_program`
- `funder_organizations[]`
- `recipient_organizations[]`
- `funding_type`: capital, operating, mixed, grant, transfer, or unclear
- `recurrence`: one_time, recurring, multi_year, or unclear
- `funding_period_start` / `funding_period_end`
- `promised_quantity`, `unit`, and `geographic_allocation`
- linked instrument, commitment, service/resource, and implementation-evidence IDs
- source URL, publication date, source role, evidence classification, and confidence
- owner-review and publication gates

## Claim rules

- Record the amount exactly at the scope stated by the source.
- Do not divide an aggregate amount among facilities without a source.
- Separate authorized, budgeted, announced, contracted, expended, and audited amounts.
- Separate capital from operating funding and one-time from recurring funding when documented.
- A funding announcement is not operational evidence.
- A service opening does not prove how much funding was spent.

## Architecture recommendation

Keep funding as an evidence-bearing observation linked to commitments, instruments, organizations, and resources. Do not add a scalar `funding_amount` to the resource table. No schema migration is justified until a benchmark contains enough fully specified funding observations to test cardinality and amendment behavior.
