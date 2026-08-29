# Samwise ↔ Miller integration contract

Implemented: `samwise-miller-geocode-evidence-v2` shares bounded provider observations. Miller independently validates address identity and geocode QC. Address identity, provenance, and interpretation are separate.

Prepared: `samwise-miller-location-apply-v1` binds one owner-confirmable mapping proposal to a Miller resource, identity fingerprint, geocoder evidence, machine QC, and coordinate fingerprint. A confirmation is single-use when the later Miller apply operator consumes it.

Authority: Miller owns canonical resources, `resource_locations`, and map eligibility/publication. Samwise owns observations, Farm projections, stewardship proposals, and owner attention. Igor is a future independent observer/reviewer only.

Shared rules: evidence is shared without transferring authority; observer health is distinct from target health; model output is advisory. Mapping apply is domain-specific—not a generic mutation channel. Igor/security capabilities remain deferred.
