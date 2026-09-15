# Miller public release boundary

This branch is the deployable public Miller and Treaty 6 runtime. It contains
reviewed public data, the browser and server runtime, and the tests needed to
validate that deployed surface.

## Public contract

`npm test` runs the production test contract. It must pass from a clean
checkout without owner-only artifacts, local service state, or research
automation. `npm run lint` and `npm run build` validate the same release
surface.

The owner’s private development lineages retain broader Samwise, research,
review, and local-service tests. Those are intentionally not a dependency of
this release branch or its default test command.

## Reviewed projections

Some public JSON files are reviewed, sanitized projections of a private
research process. The public runtime reads the committed projection only. It
does not need the private source corpus to run or build.

The Treaty 6 public beta follows that model: secure source inputs and its
private generator workflow remain outside a sanitized release checkout; the
reviewed public projection is committed here for runtime use.

## Excluded material

Private candidate artifacts, owner-review records, research source packs,
local databases, caches, logs, secure inputs, and local automation state must
not be added to this branch. See `.gitignore` for the protected local paths.

## Current limitation

The legacy Express server still contains owner/admin and Samwise integration
routes inherited from the historical application. They are not required by the
browser build, but they remain in `server.js`. Separating those routes into a
private server boundary is an intentionally separate, owner-reviewed
architectural change; this document must not be read as evidence that the
server-side boundary is already complete.
