# Miller location automation policy v1.2.1

Policy identifier: `miller-location-auto-v1.2.1`.

The licensed BC Address Geocoder production service is called from Miller's server with the `apikey` header. The client ID is application metadata and is not transmitted. Credentials must never enter browser code, logs, tracked files, query parameters, or review artifacts.

BC Location Services has clarified that results may be cached, stored permanently, and displayed persistently on a map under the Open Government Licence – British Columbia. All returned location descriptors are licensed. Parcel points are the most common authoritative address locations and may be accepted for an ordinary public-service map when every identity, occupancy, sensitivity, address-match, and human-override gate passes. A parcel point must not be described as an entrance or rooftop. Routing points require review. Interpolated access points require an explicit finding that the curb or road-edge point is not misleading.

Required attribution: [Contains information licensed under the Open Government Licence – British Columbia.](https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc)

Geocoding validates an address location. It does not prove that a particular program occupies the building. Phase 1P produces a non-public review inventory only and performs no Supabase or publication writes.
