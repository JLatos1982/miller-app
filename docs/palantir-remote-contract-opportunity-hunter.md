# Palantír remote contract opportunity hunter

This bounded owner-intelligence workflow looks for remote contract, project, freelance, and light asynchronous work resembling capabilities already exercised by Palantír and the Farm. It is not a full-time job search and has no authority to apply, contact a buyer, publish a profile, or mutate a public product.

## Operating boundary

The hunter accepts owner-reviewed listing metadata only from an allowlist of public career and marketplace hosts. It normalizes canonical URLs, remote/Canadian eligibility, contract form, expected hours, disclosed compensation, credential constraints, application effort, Farm fit, and automation potential. Duplicate identity is based on canonical URL, company, and title.

Current source classes are first-party Ashby and Lever career pages, public Alignerr listings, public Jobs.ca listings, and publicly viewable Upwork project pages. Access controls must not be bypassed. A future source adapter must preserve provider terms and must not require a fake account or unrestricted crawling.

## Human and automation boundary

Palantír may assist when contract terms permit with public-source retrieval, fingerprinting, structured extraction, URL health, deduplication, citation normalization, research memory, and draft reports. The owner remains responsible for factual verification, judgment, client communication, confidentiality, and final delivery. AI-evaluation vendors may prohibit outside model use; those tasks are human work unless the contract explicitly allows assistance.

Hourly work must be billed according to the contract. Efficiency created by Palantír is best captured through honestly scoped fixed-fee or deliverable pricing.

## Recurring-listener design

The proposed listener ID is `palantir_remote_contract_opportunities_weekly`. Its cadence is weekly and its alert policy is new strong-fit opportunities only. It suppresses canonical duplicates and excludes permanent roles, incompatible hours, non-Canadian eligibility, expired listings, and unconfirmed mandatory credentials from alerts.

The listener is intentionally designed but not enabled. Activation requires stable, terms-compatible source adapters and an owner-approved alert threshold. A manual bounded research cycle can be run with:

```sh
node scripts/run-palantir-remote-contract-opportunity-cycle.mjs PRIVATE_INPUT_JSON PRIVATE_OUTPUT_DIRECTORY
```

Inputs and outputs belong in the ignored private Palantír artifact area. Current opportunities, owner-fit notes, and application decisions are not source-controlled.

## Portfolio boundary

Public-safe proof may use the Miller resource finder, the mobile API contract and demo mode, generalized Palantír listener/reconciliation architecture, and anonymized resource-quality examples. Private owner-review records, unpublished Miller North research, credentials, production state, and client information must never appear in a portfolio.
