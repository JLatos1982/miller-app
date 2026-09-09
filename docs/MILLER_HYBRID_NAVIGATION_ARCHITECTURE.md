# Miller Navigator hybrid search architecture

Miller Navigator is deterministic-first practical navigation, not a general chatbot. The mobile route builds a verified Miller result set, applies service-area semantics, explains the practical sequence, and only then assesses whether external public-source discovery would materially improve the result.

## External-search gate

The gate is explainable. It triggers when one or more outcome-based conditions apply:

- the worker explicitly chooses **Search more broadly**;
- there is no verified local or regional pathway for the stated community;
- a foundation or exploratory coverage area also lacks a local/regional pathway or a primary-intent match;
- a requested barrier need (housing, transportation, funding, counselling, legal, basic needs, or re-entry) has no verified match;
- there is no verified primary-intent match; or
- the verified result set has no usable contact or access information.

The route returns the reasons as `external_search_reasons`. It does not use an arbitrary numerical threshold. A well-covered urban query remains internal-only.

## Bounded Tavily discovery

The shared adapter uses the established Tavily Search API. It sends a synthesized query from normalized geography and recognized need categories, never the raw frontline narrative. It requests at most five results, has an eight-second provider timeout, filters obvious directory/social sources, favors public/government/health-authority domains, and caches only normalized geography plus needs for fifteen minutes in process memory.

Tavily output is public-source discovery evidence, not Miller truth. It is returned as an `external_unverified` card with an unmistakable label, lacks invented location/phone/eligibility data, and never receives a canonical Miller ID.

## Ranking, pathway, and packs

Verified local and regional pathways remain first and power the deterministic sequence. External cards are rendered in a separate review section after verified groups. Workers can add either kind to a pack, reorder or remove it, and print/share only after review. Every external item remains labeled in the pack and printed output.

## Verification loop and privacy

Each external card carries a candidate fingerprint, source URL, normalized geography/need categories, and exact canonical duplicate check. The worker may submit that public-source candidate to the existing private resource-review queue. No original request, person, clinical narrative, or automatic publication is involved. A reviewer must reconcile, verify an official source, and promote it through the normal canonical process before it becomes a verified Miller resource.

Aggregate mobile metrics contain counts, duration, geography/intent buckets, and external-search/result totals only. Runtime external metrics record units and configured cost estimates when available; they do not retain raw requests.

## Failure behavior

If Tavily is not configured, times out, rate limits, or returns malformed output, the verified Miller response remains usable. The client receives a plain-language broader-search status rather than a search failure.
