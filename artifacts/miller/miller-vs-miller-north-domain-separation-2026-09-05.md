# Miller and Miller North domain-separation memo

## Boundary

Miller North remains about documented Indigenous healthcare racism, safety, accountability and institutional response. Miller remains about addictions resources, treatment access, toxic-drug policy, standards, government commitments and implementation.

The new tables use the `miller_addictions_` prefix, stable IDs beginning `mapc_`, `mapi_` and `madc_`, plus a database check requiring `research_domain = 'miller_addictions'`. No Miller North table is referenced by the new schema. No candidate is published by the migration.

## Shared semantics

Both domains can use evidence class, source role, instrument type, binding status, commitment status, implementation scope, amendment/supersession, recurrence signals, deterministic fingerprints and owner/publication gates.

## Miller-specific fields

- topic tags for OAT, toxic drugs, treatment capacity, drug checking and related service systems
- expected service quantity/unit and public funding amount
- optional link to Miller's canonical `resource_registry`
- candidate resource name and match state
- operational evidence date and service-availability summary

## Miller North-specific fields

- Indigenous-specific relevance and nation/community context
- incident and cohort links for racism, discrimination and cultural safety harms
- accountability action stages such as allegation, investigation and finding
- privacy handling for complaints and named/unnamed patients

## Cross-domain cases

An Indigenous-led addiction treatment service may appear in Miller because it is a treatment resource or service commitment. It belongs in Miller North only when there is a documented Indigenous healthcare accountability relationship. The subject’s Indigenous relevance alone is not enough to copy or merge it.

## Safeguards

- No cross-domain foreign keys.
- No shared publication switch.
- No automatic record copying.
- Any future cross-domain relationship should be an owner-reviewed citation-level link, not dataset merger.
- The local admin preview is not connected to a public route.
