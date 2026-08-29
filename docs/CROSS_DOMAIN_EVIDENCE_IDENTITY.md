# Cross-domain evidence identity

Evidence handoffs keep three separate layers:

1. **Identity** is the bounded fact both domains can reproduce. For address
   evidence this is the canonical Miller resource ID plus Miller's normalized
   civic, street, suffix, direction, municipality, and province.
2. **Provenance** records who observed it, from where, and when. It remains
   auditable but does not need to be byte-identical in another domain.
3. **Interpretation** is the receiving domain's later conclusion. A Samwise
   geocode observation never supplies Miller's exact-civic decision.

Changing a current Miller address changes its identity fingerprint and rejects
old geocode evidence. Changing only Samwise provenance does not change address
identity.

The same separation is intended for future Igor security evidence: Samwise and
Igor can independently agree on an asset identity (stable asset ID and
normalized hostname), retain Igor's observer/time provenance separately, and
leave Samwise to interpret any bounded TLS or posture observation.
