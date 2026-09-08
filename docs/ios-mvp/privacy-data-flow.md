# Miller iOS MVP privacy and data flow

## Data the app handles transiently

- A generic typed or spoken resource request.
- Optional province selection.
- Public verified resource results.
- A local in-memory selection of resources for sharing.

Speech audio is handled through Apple's native speech APIs. The transcript enters the same search path as typed text. If permission is denied, typed search remains fully available.

## Data stored

- On device: aggregate counts for searches, shares, no-results, and the last 50 search-duration measurements.
- On feedback submission: canonical resource ID, resource name/city/website, and one bounded feedback reason through the existing resource-review intake.

## Data not stored in v1

- Query text or speech transcript.
- Client or patient name, date of birth, PHN, diagnosis, case history, clinical note, or selected-resource pack.
- A user account or server-side query history.
- Microphone audio by Miller.

The mobile search response asserts `query_stored: false`, `client_record_created: false`, and `patient_identifiers_requested: false`; the client rejects a contract that says otherwise.

## Sharing

The resource pack includes only Miller's concise next step and selected public resource contact/access fields. It deliberately excludes the original request, internal scores, source-review details, and user/client identifiers. The worker chooses the iOS share destination. Printing uses an escaped, local HTML formatter.

## Security

- The app contains no Supabase service role, API token, HMAC value, Palantír credential, or Farm endpoint.
- Release traffic uses HTTPS to the public Miller service.
- Search is read-only, bounded, and rate-limited.
- Public projection rules reject investigations, legal/accountability records, Tavily candidates, hidden/closed records, and Miller North intelligence.
- There is no local resource database to become stale or leak private metadata.

Before a pilot, complete a privacy review of Apple speech processing, analytics disclosure, feedback retention, device management, and the participating organization's policies. The preferred workflow remains free of identifiable information.
