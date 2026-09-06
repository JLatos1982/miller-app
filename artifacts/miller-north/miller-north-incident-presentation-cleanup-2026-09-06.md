# Miller North incident and evidence presentation cleanup

> Private review artifact. No source row, incident, or production record was merged, deleted, or changed.

## Count interpretation

The existing public projection contains **695 approved source-derived evidence rows**. Those rows are not equivalent to 695 distinct incidents.

The new presentation projection contains:

- 321 public evidence groups
- 111 incident-like groups
- 107 separately presented incident-like groups
- 4 groups where the same bounded evidence text is supported by additional source URLs
- 210 cohort, systemic, review, policy, or other contextual groups

## Duplicate and relationship decisions

| Classification | Count | Presentation treatment |
|---|---:|---|
| `same_incident_duplicate` | 0 strict duplicate rows | No strictly identical source/status/summary duplicate met the automatic rule. |
| `same_incident_additional_source` | 4 public groups / 24 additional rows | One card with combined source links. |
| `probable_duplicate_owner_review` | 4 clusters | Left separate; private owner review required. |
| `related_context_not_same_incident` | 16 repeated-source clusters | Left separate where a source contains distinct experiences or claims. |
| `separate_incident` | 107 groups | Presented separately. |
| `cohort_or_systemic_record` | 210 groups | Presented as context/systemic evidence, not counted as a single incident. |
| `insufficient_identity` | 0 automatically published groups | Uncertain private candidates are handled through Live Listening review instead. |

Presentation grouping also consolidated 350 repeated contextual extraction rows. This is an editorial projection only. It does not assert that all statements in one systemic report are one incident.

## Decision rules

- Same normalized evidence text, province, status, identity fields, and source is safe for deterministic duplicate suppression.
- The same bounded text across source URLs may be shown once with multiple sources.
- Repeated systemic/review excerpts from the same source may be shown as one contextual evidence group.
- A shared facility, topic, or article is never enough to merge distinct patient experiences.
- Matching source titles across different URLs are review signals, not automatic merges.

## Traceability

Every one of the 695 public record IDs appears in exactly one presentation group. The full decision and membership map is stored in `miller-north-incident-presentation-reconciliation-2026-09-06.json`.
