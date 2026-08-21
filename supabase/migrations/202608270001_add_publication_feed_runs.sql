begin;
create table public.publication_feed_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running','completed','failed','cancelled')) default 'running',
  requested_limit integer not null check (requested_limit between 1 and 100),
  created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.publication_feed_run_items (
  run_id uuid not null references public.publication_feed_runs(id) on delete cascade,
  resource_id uuid not null references public.resource_registry(id) on delete cascade,
  selection_rank integer not null,
  stage text not null check (stage in ('selected','evidence','geocoder','machine_qc','routed','blocked','excluded')),
  outcome text not null check (outcome in ('pending','ready_to_publish','one_confirmation_away','human_review','machine_blocked','not_map_eligible','already_published','failed')) default 'pending',
  reason_codes jsonb not null default '[]'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  lease_token uuid, lease_expires_at timestamptz,
  evidence_version text, qc_version integer, last_error text,
  started_at timestamptz not null default now(), completed_at timestamptz, updated_at timestamptz not null default now(),
  primary key (run_id,resource_id)
);
alter table public.publication_feed_runs enable row level security;
alter table public.publication_feed_run_items enable row level security;
revoke all on table public.publication_feed_runs,public.publication_feed_run_items from anon,authenticated;
grant all on table public.publication_feed_runs,public.publication_feed_run_items to service_role;

create or replace function public.claim_publication_feed_item(p_run_id uuid,p_resource_id uuid,p_lease_token uuid,p_lease_seconds integer default 120)
returns public.publication_feed_run_items language plpgsql security definer set search_path=public as $$
declare claimed public.publication_feed_run_items;
begin
 update public.publication_feed_run_items set lease_token=p_lease_token,lease_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,600))),attempts=attempts+1,started_at=coalesce(started_at,now()),updated_at=now()
 where run_id=p_run_id and resource_id=p_resource_id and outcome='pending' and (lease_expires_at is null or lease_expires_at<now() or lease_token=p_lease_token)
 returning * into claimed;
 if not found then raise exception 'publication feed item is already claimed or complete' using errcode='PT409'; end if;
 return claimed;
end $$;
revoke all on function public.claim_publication_feed_item(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_publication_feed_item(uuid,uuid,uuid,integer) to service_role;
commit;
