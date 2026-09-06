-- Expand the private-only Miller North incident identity model.  A record is
-- either a public named case or a public, specifically describable event whose
-- patient is intentionally not identified.  Legacy rows remain unclassified:
-- this migration does not infer a person or relabel previous research.
alter table public.miller_north_incidents
  add column if not exists public_case_name text,
  add column if not exists incident_identity_class text,
  add column if not exists identity_fingerprint_version text not null default 'miller-north-event-identity-v1',
  add column if not exists event_identity_facts jsonb not null default '{}'::jsonb;

alter table public.miller_north_incidents
  drop constraint if exists miller_north_incident_identity_class_valid;

alter table public.miller_north_incidents
  add constraint miller_north_incident_identity_class_valid check (
    incident_identity_class is null
    or (
      incident_identity_class = 'named_incident'
      and public_case_name is not null
      and char_length(btrim(public_case_name)) between 1 and 240
    )
    or (
      incident_identity_class = 'unnamed_but_specific_incident'
      and public_case_name is null
      and facility is not null
      and municipality is not null
      and timing_semantic in ('exact_event_date', 'event_year', 'approximate_event_year')
      and jsonb_typeof(event_identity_facts -> 'distinctive_encounter_facts') = 'string'
      and char_length(btrim(event_identity_facts ->> 'distinctive_encounter_facts')) between 12 and 1200
      and provenance ? 'source_provenance'
    )
  );

create index if not exists miller_north_incidents_identity_class_idx
  on public.miller_north_incidents (incident_identity_class, province, last_researched_at desc);

comment on column public.miller_north_incidents.public_case_name is
  'Publicly disclosed case name only. Null for intentionally unnamed patients; never synthesize a patient identifier.';
comment on column public.miller_north_incidents.incident_identity_class is
  'named_incident or unnamed_but_specific_incident. Null is retained only for legacy rows not reclassified by inference.';
comment on column public.miller_north_incidents.event_identity_facts is
  'Bounded facility, locality, timing, and distinctive encounter facts used for private reconciliation; never personal-clue deanonymization.';
