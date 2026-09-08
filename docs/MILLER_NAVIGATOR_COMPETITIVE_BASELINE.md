# Miller Navigator competitive baseline

Reviewed: 2026-09-08. This is a bounded product comparison based on public, first-party descriptions; it is not a feature-completeness audit.

## What the market already does well

| Product | Publicly described strength | Product lesson for Miller |
|---|---|---|
| 211 Canada and provincial 211 | Very broad community, government, health and social-service coverage; phone/chat/text/web navigation; national directory and trained navigators | Complement this breadth. Do not compete on record count. Preserve 211 as a verified navigation fallback. |
| HelpSeeker Navigi (current public service-search offering; no distinct current HelpSeeker “Compass” product was established in this review) | Social-service search plus municipal/nonprofit data and planning; related products span case management and analytics | Miller should stay out of case management and planning dashboards in v1. Its wedge is the immediate frontline handoff. |
| Caredove | Service navigation plus booking/eReferral and area-based service maps; professional/referrer workflows | Accurate service areas and explicit access are table stakes. Referral transmission requires a much higher privacy/integration scope and is deferred. |
| OceanMD | Maintained Healthmap, distance/wait-time search, eReferrals/eRequests, EMR/HIS integrations | Miller should not compete with mature referral networks. A future integration should hand off into them rather than rebuilding them. |
| Strata Health | Resource matching, referral, waitlist, placement and patient-flow workflows across health systems | The frontline transition problem is real, but Miller’s MVP stays upstream: practical options and a privacy-safe pack, not placement or clinical decision support. |

## Minimum real differentiation

Miller must do more than return the same links. The minimum defensible differences are:

- accept messy, multi-need addiction/social-service requests without requiring category translation;
- separate “located in” from “serves” and explain rural/regional pathways;
- sequence only source-backed access steps;
- connect treatment with barriers such as housing, cost, transport, legal navigation, and re-entry;
- explain briefly why a result was shown;
- produce a neutral selected-resource handoff pack in a few interactions;
- show practical freshness and correction feedback without collecting client data.

Voice is useful for speed but is not differentiation by itself. Directory breadth, maps, AI branding, EMR integration, and booking should not be pursued before frontline pilot evidence.

## 211 integration feasibility

211 integration is plausible only through permission/partnership, not scraping.

- 211 Canada says its directory contains more than 150,000 programs and that data can be supplied through APIs, map-ready files, or Excel after a request through its Data Sharing Portal: https://211.ca/data/
- 211 Ontario explicitly offers service/program API integration by contacting `211data@211ontario.ca`: https://211ontario.ca/211-data/
- 211 Canada invites partnership conversations: https://211.ca/partner-with-211/
- B.C.’s terms limit use to personal, informational, non-commercial use unless separately authorized and prohibit automated copying: https://bc.211.ca/terms-of-service/
- Alberta and Saskatchewan terms similarly limit ordinary website content reuse and require express consent for redistribution/custom uses: https://ab.211.ca/terms-of-use/ and https://sk.211.ca/terms-of-use/

Recommendation: prepare a short partnership/data-use request covering B.C., Alberta, and Saskatchewan, commercial pilot use, update cadence, permitted fields, attribution, caching, correction flow, and API/service-level terms. Until written rights are clear, continue using independently verified official provider/government sources and link to 211 as a navigation option.

## Primary sources consulted

- 211 Canada home and data pages: https://211.ca/ and https://211.ca/data/
- 211 Ontario data/API page: https://211ontario.ca/211-data/
- 211 B.C., Alberta, and Saskatchewan terms linked above
- HelpSeeker: https://www.helpseeker.org/
- Caredove product/help: https://www.caredove.com/ and https://help.caredove.com/en/articles/760102-search-book-connect
- Ocean Provider Network: https://www.oceanmd.com/ocean-provider-network/
- Strata Health Canada: https://stratahealth.com/ca/
