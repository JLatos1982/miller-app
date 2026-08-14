begin;

alter table public.curated_lists
  add column if not exists import_trust_level text not null default 'standard_review'
    check (import_trust_level in ('standard_review','trusted_curator'));

alter table public.list_import_batches
  add column if not exists import_source_type text not null default 'admin_docx'
    check (import_source_type in ('admin_docx','other')),
  add column if not exists import_trust_level text not null default 'standard_review'
    check (import_trust_level in ('standard_review','trusted_curator')),
  add column if not exists review_method text,
  add column if not exists bulk_reviewed_by uuid references auth.users(id),
  add column if not exists bulk_reviewed_at timestamptz;

alter table public.list_import_items
  add column if not exists review_method text;

alter table public.curated_list_items
  add column if not exists source_import_batch_id uuid references public.list_import_batches(id) on delete set null,
  add column if not exists review_method text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists original_document_hash text,
  add column if not exists parser_version text;

alter table public.curated_list_items drop constraint if exists curated_list_items_verification_status_check;
alter table public.curated_list_items add constraint curated_list_items_verification_status_check
  check (verification_status in ('unverified','needs_review','verified','expired','imported_from_trusted_source','externally_verified','needs_update','hidden'));

create unique index if not exists curated_list_items_source_import_unique
  on public.curated_list_items(source_import_item_id)
  where source_import_item_id is not null;

drop policy if exists "Public reads visible reviewed list items" on public.curated_list_items;
create policy "Public reads visible reviewed list items" on public.curated_list_items for select to anon, authenticated
  using (visible and verification_status in ('verified','externally_verified','imported_from_trusted_source')
    and exists (select 1 from public.curated_lists l where l.id = list_id and l.status = 'published'));

drop policy if exists "Public reads visible published placements" on public.curated_list_item_sections;
create policy "Public reads visible published placements" on public.curated_list_item_sections for select to anon, authenticated
  using (visible and exists (
    select 1 from public.curated_list_items i join public.curated_lists l on l.id = i.list_id
    where i.id = item_id and i.visible
      and i.verification_status in ('verified','externally_verified','imported_from_trusted_source')
      and l.status = 'published'
  ));

create or replace function public.trusted_bulk_import_curated_list(
  p_list_id uuid, p_batch_id uuid, p_admin_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_batch public.list_import_batches%rowtype;
  v_created integer := 0;
  v_placements integer := 0;
  v_cleanup integer := 0;
  v_without_website integer := 0;
begin
  select * into v_batch from public.list_import_batches
    where id = p_batch_id and list_id = p_list_id for update;
  if not found then raise exception 'trusted import batch not found'; end if;
  if v_batch.import_source_type <> 'admin_docx' then raise exception 'trusted bulk import is limited to administrator DOCX batches'; end if;

  if v_batch.parsing_status = 'committed' then
    select count(*) into v_created from public.curated_list_items where source_import_batch_id = p_batch_id;
    select count(*) into v_placements from public.curated_list_item_sections p join public.curated_list_items i on i.id = p.item_id where i.source_import_batch_id = p_batch_id;
    return jsonb_build_object('outcome','structured_draft_committed','idempotent',true,'structured_items',v_created,'section_placements',v_placements,'published',false);
  end if;
  if v_batch.parsing_status <> 'parsed' then raise exception 'trusted import batch is not ready'; end if;

  update public.curated_lists set import_trust_level = 'trusted_curator', updated_by = p_admin_id, updated_at = now(), last_reviewed_at = now()
    where id = p_list_id and status = 'draft';
  if not found then raise exception 'trusted import requires a draft list'; end if;

  update public.list_import_batches set import_trust_level = 'trusted_curator', review_method = 'trusted_bulk_import', bulk_reviewed_by = p_admin_id, bulk_reviewed_at = now()
    where id = p_batch_id;
  update public.list_import_items set final_disposition = 'list_only_entry', review_status = 'reviewed', review_method = 'trusted_bulk_import', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    where batch_id = p_batch_id and final_disposition = 'undecided';
  update public.list_import_items set review_method = 'trusted_bulk_import', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    where batch_id = p_batch_id and final_disposition = 'list_only_entry';

  insert into public.curated_list_items (
    list_id, item_type, resource_name, description, phone, email, website, contact_notes, curator_note,
    visible, verification_status, source_import_item_id, source_import_batch_id, review_method, reviewed_by,
    reviewed_at, original_document_hash, parser_version
  )
  select p_list_id, 'list_only_entry',
    case when nullif(trim(ii.parsed_name),'') is null or ii.parsed_name = 'Needs manual identification'
      then coalesce(nullif(trim(split_part(ii.raw_source_text, E'\n', 1)),''), 'Entry requiring title review')
      else ii.parsed_name end,
    coalesce(nullif(ii.administrator_corrections->>'description',''), ii.parsed_description, ii.raw_source_text),
    coalesce(nullif(ii.administrator_corrections->>'phone',''), ii.parsed_contact->'phones'->>0, ''),
    coalesce(nullif(ii.administrator_corrections->>'email',''), ii.parsed_contact->'emails'->>0, ''),
    coalesce(nullif(ii.administrator_corrections->>'website',''), ii.parsed_contact->'websites'->>0, ''),
    coalesce(ii.administrator_corrections->>'contact_notes',''),
    case when nullif(trim(ii.parsed_name),'') is null or ii.parsed_name = 'Needs manual identification' then 'Needs title cleanup.' else '' end,
    true, 'imported_from_trusted_source', ii.id, p_batch_id, 'trusted_bulk_import', p_admin_id,
    now(), v_batch.source_sha256, v_batch.parser_version
  from public.list_import_items ii
  where ii.batch_id = p_batch_id and ii.final_disposition = 'list_only_entry'
  order by ii.display_order
  on conflict (source_import_item_id) where source_import_item_id is not null do nothing;
  get diagnostics v_created = row_count;

  insert into public.curated_list_item_sections(item_id, section_id, display_order, visible)
  select ci.id, cs.id, ii.display_order, true
  from public.list_import_items ii
  join public.curated_list_items ci on ci.source_import_item_id = ii.id
  join public.curated_list_sections cs on cs.list_id = p_list_id and cs.title = ii.detected_section
  where ii.batch_id = p_batch_id and ii.final_disposition = 'list_only_entry'
  order by cs.display_order, ii.display_order
  on conflict (item_id, section_id) do nothing;
  get diagnostics v_placements = row_count;

  select count(*) into v_cleanup from public.list_import_items ii
    where ii.batch_id = p_batch_id and (nullif(trim(ii.parsed_name),'') is null or ii.parsed_name = 'Needs manual identification'
      or exists (select 1 from jsonb_array_elements(ii.validation_warnings) w where w->>'code' in ('malformed_email','mislabeled_contact')));
  select count(*) into v_without_website from public.list_import_items ii
    where ii.batch_id = p_batch_id and coalesce(jsonb_array_length(ii.parsed_contact->'websites'),0) = 0;

  update public.list_import_batches set parsing_status = 'committed', committed_at = now() where id = p_batch_id;
  return jsonb_build_object('outcome','structured_draft_committed','idempotent',false,'structured_items',v_created,
    'section_placements',v_placements,'needs_cleanup',v_cleanup,'without_websites',v_without_website,'published',false);
end;
$$;

revoke all on function public.trusted_bulk_import_curated_list(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.trusted_bulk_import_curated_list(uuid,uuid,uuid) to service_role;

commit;
