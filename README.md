# Miller

Miller is a React/Vite resource finder with an Express backend, OpenAI guidance, Tavily discovery, and Supabase storage.

## Local setup

```bash
npm install
cp .env.example .env
npm run build
npm run server
```

The Express server defaults to `http://localhost:8787`. Vite development remains available with `npm run dev`, but API requests require the Express backend or a configured development proxy.

`SUPABASE_URL` must be the project origin, such as `https://project-ref.supabase.co`; do not append `/rest/v1`. Keep `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server-side. The browser uses the publishable key already configured in `src/supabaseClient.js` and relies on RLS.

## AI-assisted resource review

The admin review card can run four server-side checks for one `tavily_resources` row:

1. Resource review suggests approve, reject, or manual review.
2. Tagging suggests metadata based on Miller's existing category vocabulary.
3. Duplicate detection applies normalized URL/name/organization comparisons first, then uses the model only for a small ambiguous candidate set.
4. Link and quality performs a limited SSRF-protected website request and reports completeness signals.

The orchestrator stores results in `ai_resource_reviews`. Each check is isolated, so successful checks are retained when another fails. Resource and webpage content is treated as untrusted prompt data. No service can approve, hide, delete, merge, or overwrite the resource. A human must still use the existing Approve or Hide controls.

Analysis runs only after an administrator presses **Run AI review**. Each completed review stores a deterministic fingerprint of review-relevant resource content plus its model and schema/prompt version. **Rerun analysis** reuses the latest completed review when all three still match; **Force rerun** deliberately creates a new audit record. The model used for fresh calls is controlled by `OPENAI_REVIEW_MODEL`; each full run normally makes two model calls plus a third only when deterministic duplicate evidence is ambiguous. The link request does not use OpenAI.

Disable the feature without removing the interface by setting:

```dotenv
AI_REVIEW_ENABLED=false
```

## Supabase migration

Apply the SQL files in `supabase/migrations` in timestamp order through the Supabase SQL editor or your normal migration workflow. They:

- creates the audit table and foreign key to `tavily_resources`;
- prevents simultaneous queued/running reviews for one resource;
- adds the fingerprint lookup used for safe review reuse;
- enables RLS and grants no access to `anon` or `authenticated`;
- leaves server-side service-role access available.

Do not expose the service-role key to the browser. The migration does not modify or delete existing resource rows.

## Admin access

The existing site-password session authenticates the Express admin APIs. Browser `localStorage` controls only whether the admin UI is displayed; it does not authorize database access. Enable the interface in the browser console with:

```js
localStorage.setItem("miller_admin", "true");
location.reload();
```

## Personalized handouts

Users can add ordinary search-result cards to a temporary handout, reorder them, edit handout-only descriptions and notes, and personalize the finished document. Handouts can be printed, saved as PDF through the browser print dialog, or downloaded as a standalone HTML file.

Handout state exists only in active React memory. It is not written to Supabase, Express, analytics, OpenAI, Tavily, browser storage, cookies, URLs, or console logs. Refreshing or closing the page clears it; the browser shows a standard unsaved-changes warning while the handout contains work.

## Verification

```bash
npm test
npm run lint
npm run build
node --check server.js
```

Tests use Node's built-in test runner and mock model/network behavior. They do not contact OpenAI, Tavily, or Supabase.
