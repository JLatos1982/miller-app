# Accountability model fixture validation

The original 37-record benchmark was processed only through the local `millerNorthAccountabilityActions` normalizer. No action, cohort, incident, person, source, or link row was written to Supabase.

| Validation outcome | Count |
| --- | ---: |
| Raw records already using the new canonical value names | 0 |
| Compatible after deterministic action-type, stage, timing, and status normalization | 37 |
| Ambiguous / not safely normalized | 0 |
| Rejected | 0 |
| Require owner review (overlaps the compatible set) | 6 |
| Accountability chains | 17 |
| Chains with more than one stage | 6 |
| Action-level source references retained | 79 |

Every candidate is private (`staged_private_review` or `owner_review_required`). The six owner-reviewed candidates cannot receive the `approved_for_publication` state through the payload guard.

## What was normalized

- The benchmark’s ten descriptive action-type labels map one-to-one to the new canonical enum values.
- Exact dates, year-only dates, and month/range text are retained without promoting a month or publication period to an exact date.
- Action stages preserve allegations, recommendations, commitments, implementation, and follow-up as distinct states. In particular, a legal filing is kept as `allegation`, and absent outcome evidence becomes `outcome_not_public`.
- Each source is stored against its action with a source role. The benchmark did not contain individual per-URL publication dates, so those remain null with a provenance note rather than being invented.

## Benchmark fields that remain intentionally non-normalized

- `named_organizations` remain in action provenance and source organization fields; this pass deliberately does not introduce a generic organization entity system.
- Some follow-up dates are prose (for example, a report period or implementation month) and remain `implementation_evidence_date_text` until a source-specific date is verified.
- The benchmark does not supply a source title or publication date for every corroborating URL. The action source model accepts those as missing while retaining the URL and source type.

Run locally with:

```sh
node --test test/millerNorthAccountabilityActions.test.js test/millerNorthAccountabilityMigration.test.js
```
