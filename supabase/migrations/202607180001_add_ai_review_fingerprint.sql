begin;

alter table public.ai_resource_reviews
  add column if not exists review_fingerprint text;

alter table public.ai_resource_reviews
  drop constraint if exists ai_resource_reviews_fingerprint_format;

alter table public.ai_resource_reviews
  add constraint ai_resource_reviews_fingerprint_format
  check (review_fingerprint is null or review_fingerprint ~ '^[0-9a-f]{64}$');

create index if not exists ai_resource_reviews_reuse_lookup_idx
  on public.ai_resource_reviews (
    resource_id,
    review_fingerprint,
    model_identifier,
    schema_version,
    created_at desc
  )
  where status = 'completed';

commit;

