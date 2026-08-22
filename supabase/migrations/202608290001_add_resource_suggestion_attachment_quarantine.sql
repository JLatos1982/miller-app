begin;

-- Scan decisions are private, append-only provenance. A clean decision is
-- intentionally reserved for a future scanner service; this migration does
-- not introduce scanning or make any attachment available.
create table public.resource_submission_attachment_scan_decisions (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.resource_submission_attachments(id) on delete cascade,
  decision text not null check (decision in ('clean', 'malicious', 'failed')),
  actor_type text not null check (actor_type in ('administrator', 'scanner_service')),
  actor_id uuid,
  scan_engine text not null check (btrim(scan_engine) <> ''),
  scan_reference text,
  decision_note text,
  created_at timestamptz not null default now(),
  check (actor_type <> 'administrator' or actor_id is not null),
  check (decision <> 'clean' or (actor_type = 'scanner_service' and scan_reference is not null and btrim(scan_reference) <> ''))
);

create index resource_submission_attachment_scan_decisions_attachment_created_idx
  on public.resource_submission_attachment_scan_decisions(attachment_id, created_at desc);

alter table public.resource_submission_attachment_scan_decisions enable row level security;
revoke all on public.resource_submission_attachment_scan_decisions from public, anon, authenticated;
grant all on public.resource_submission_attachment_scan_decisions to service_role;

-- Defense in depth: even a future server implementation cannot set a row
-- available before a matching clean scanner-service decision has been saved.
create or replace function public.enforce_resource_submission_attachment_quarantine()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'available' and not exists (
    select 1
    from public.resource_submission_attachment_scan_decisions decision
    where decision.attachment_id = new.id
      and decision.decision = 'clean'
      and decision.actor_type = 'scanner_service'
  ) then
    raise exception 'attachment cannot be available without a clean scanner-service decision' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists resource_submission_attachment_quarantine_guard on public.resource_submission_attachments;
create trigger resource_submission_attachment_quarantine_guard
  before insert or update of status on public.resource_submission_attachments
  for each row execute function public.enforce_resource_submission_attachment_quarantine();

create or replace function public.record_resource_submission_attachment_scan_decision(
  p_attachment_id uuid,
  p_decision text,
  p_actor_type text,
  p_actor_id uuid,
  p_scan_engine text,
  p_scan_reference text default null,
  p_decision_note text default null
)
returns public.resource_submission_attachments
language plpgsql
security definer
set search_path = public
as $$
declare
  attachment public.resource_submission_attachments;
begin
  if p_decision not in ('clean', 'malicious', 'failed') then
    raise exception 'invalid scan decision' using errcode = '22023';
  end if;
  if p_actor_type not in ('administrator', 'scanner_service') then
    raise exception 'invalid scan actor type' using errcode = '22023';
  end if;
  if p_actor_type = 'administrator' and p_actor_id is null then
    raise exception 'administrator scan decisions require an actor' using errcode = '22023';
  end if;
  if p_decision = 'clean' and (p_actor_type <> 'scanner_service' or nullif(btrim(coalesce(p_scan_reference, '')), '') is null) then
    raise exception 'clean scan decisions require a scanner-service reference' using errcode = '22023';
  end if;

  select * into attachment
  from public.resource_submission_attachments
  where id = p_attachment_id
  for update;
  if not found then
    raise exception 'attachment not found' using errcode = 'P0002';
  end if;
  if attachment.status = 'deleted' then
    raise exception 'deleted attachments cannot receive scan decisions' using errcode = 'P0001';
  end if;

  insert into public.resource_submission_attachment_scan_decisions(
    attachment_id, decision, actor_type, actor_id, scan_engine, scan_reference, decision_note
  ) values (
    p_attachment_id, p_decision, p_actor_type, p_actor_id,
    nullif(btrim(p_scan_engine), ''), nullif(btrim(coalesce(p_scan_reference, '')), ''), nullif(left(coalesce(p_decision_note, ''), 1000), '')
  );

  update public.resource_submission_attachments
  set status = case p_decision
    when 'clean' then 'available'
    when 'malicious' then 'rejected'
    else 'pending_scan'
  end
  where id = p_attachment_id
  returning * into attachment;

  return attachment;
end;
$$;

revoke all on function public.record_resource_submission_attachment_scan_decision(uuid, text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_resource_submission_attachment_scan_decision(uuid, text, text, uuid, text, text, text) to service_role;

commit;
