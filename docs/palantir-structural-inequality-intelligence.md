# Palantír structural inequality intelligence

Palantír treats structural inequality as an evidence problem, not a label. The primitive records an observed indicator, its comparator, denominators, aligned time period, possible confounders, any documented mechanism, institutional acknowledgement, response, implementation evidence and measured outcome. It is private and owner-controlled by default.

## Evidence ladder

- **A — descriptive disparity only:** a difference is reported, but a mechanism is not established.
- **B — disparity plus plausible explanation:** the source supports a plausible structural explanation, with important uncertainty remaining.
- **C — documented institutional mechanism:** a policy, process, capacity constraint or allocation mechanism is documented.
- **D — formal acknowledgement or finding:** an authoritative institution formally acknowledges or finds the disparity or mechanism.
- **E — intervention:** a documented intervention responds to the issue; a response is not treated as implementation.
- **F — measured post-intervention outcome:** independent or appropriately designed measurement assesses what changed after intervention.

The scale does not classify racism. `discrimination_status` remains separate and may be `documented_by_source` only when the source itself supports that conclusion. Palantír never infers Indigenous identity from a name, employer, geography or community.

## Comparator and privacy rules

A structural indicator requires an explicit observed measure and denominator. Public consideration additionally requires:

- an authoritative, stable source;
- explicit Indigenous context;
- a meaningful comparator with aligned time periods and denominators;
- normalized funding comparisons when money is compared;
- no small-cell or suppression risk;
- a careful statement of what the measure does not establish;
- evidence strength C–F; and
- explicit owner approval and a public-projection request.

Raw dollar totals, unmatched time periods, urban-versus-remote comparisons without context, and small-cell data cannot pass the public gate. A missing measure may instead be classified as `data_gap`, `reporting_gap` or `measurement_gap`; missing data is not evidence of discrimination.

The v2 analysis helpers make those constraints reusable. Rate normalization retains the numerator, denominator, scale and formula. Comparator review checks jurisdiction, period, denominator, remoteness and need/population adjustment. Time-series observations remain append-only; a methodology change produces `methodology_changed`, not an invented trend. Matched-community pairs are private, limitation-bearing descriptive pilots and never automatically support an Indigenous-inequality inference.

The v3 methods add four safeguards needed for deeper longitudinal work:

- cross-province comparability is explicitly `high`, `moderate`, `poor` or `not_comparable`, with denominator, period, methodology and Indigenous-identification differences recorded instead of averaged away;
- numeric remoteness matching uses an official Index of Remoteness source, population and road/referral-role constraints, but never treats remoteness as a proxy for Indigenous identity;
- claim relationships distinguish corroboration, narrowing, contradiction and later official revision; a contradiction requires aligned subject, scope, period, denominator and methodology plus a material conflict;
- outcome-to-mechanism chains preserve several documented contributors and do not collapse them into a single causal explanation.

Structural records may retain a concise exact claim, methodology, Indigenous-identification method, suppression rules and reviewed claim relationships. This makes a changed official surveillance number explainable: the later release may supersede the earlier value while both claims remain in history.

Source-yield memory records the usable finding count, Indigenous and geographic resolution, historical depth, update cadence, data cleanliness, parse difficulty and comparator quality. Only repeatedly productive, stable sources are candidates for a recurring adapter; thin or irregular sources stay citation-led or owner-triggered.

## Accountability chain

The record keeps the following facts separate:

```text
observed disparity
  → comparator and confounders
  → documented mechanism
  → institutional acknowledgement
  → recommendation
  → response
  → claimed implementation
  → independent implementation evidence
  → measured outcome
```

That separation prevents an accepted recommendation or announced policy from being reported as an achieved outcome. Existing Palantír claim/provenance, recommendation, milestone and institutional primitives may link to a structural record without changing its public status.

## Product boundaries

Structural records belong to private Palantír and Miller North review. They never enter public Miller. Practical services discovered while researching a structural issue must independently pass the canonical resource verification gate; only that verified resource may be routed to Miller or Miller North Supports & Funding.

An `Access & Equity` projection is not automatically created. The default assessment requires at least eight owner-approved, public-safe findings spanning at least three jurisdictions. The threshold is necessary but not sufficient: the owner remains the publication authority, and a thin or misleading page stays private.

## Data availability and incomplete chains

`buildStructuralDataAvailabilityMatrix` records whether an indicator is public, insufficiently disaggregated, likely held but not public, not located, apparently not collected, or methodologically unclear. The strongest negative label requires affirmative institutional evidence. A failed search is therefore preserved without silently becoming a claim that a government does not collect the measure.

`buildStructuralAccessChain` represents the proposed path from remoteness through service availability or travel, primary-care continuity, ACSC or preventable hospitalization, and an outcome. Every stage is explicitly `supported`, `suggestive`, or `missing`. Missing stages remain visible, and no partial chain can become a causal conclusion.

Travel evidence is assessed separately. Expenditure can describe system burden, but it is not a population disparity without trips or another meaningful operational measure, a denominator, and a fair comparator. Remoteness is never treated as a proxy for Indigenous identity.

## Operational use

Recommended source handling is source-level and low-noise:

- periodically parse stable annual or follow-up reports;
- use milestones for expected updates rather than blind repeated searches;
- preserve the exact table, page or section locator;
- record source yield, comparator quality, Indigenous-specific resolution and time-series continuity;
- send ambiguous mechanisms, comparisons and apparent contradictions to owner review.

## Cross-province and remoteness analysis

Cross-province tables are a research aid, not a league table. Direct numeric comparison is allowed only when the indicator definition, unit, denominator, period, methodology and Indigenous-identification method are aligned. Moderate comparisons may support contextual discussion with explicit limitations; poor and non-comparable measures must not be ranked.

Statistics Canada's Index of Remoteness can help select candidate comparison communities because it describes proximity and travel cost to population centres. It cannot identify Indigenous communities and cannot establish an Indigenous disparity. A matched-community pilot remains descriptive unless a separate, authoritative source supplies an explicit and methodologically valid Indigenous comparison.

## Longitudinal claims

New evidence should update the dossier by relationship rather than duplication:

```text
earlier official claim
  → corroborated / narrowed / contradicted / superseded
  → later intervention claim
  → independent implementation review
  → measured outcome
```

An announced grant, newly created office or completed process recommendation is an intervention or implementation fact. It is not evidence that attachment, travel burden, safety, service access or health outcomes improved. Where public aggregate outcome reporting is absent, Palantír records a reporting or measurement gap and may prepare a bounded owner-review information-request candidate.

The primitive has no mutation or publication authority and has no dependency on Miller or Miller North UI code.
