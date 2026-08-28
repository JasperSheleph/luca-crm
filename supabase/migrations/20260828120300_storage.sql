-- ============================================================
-- Storage buckets
-- Both PRIVATE. visit-photos holds pictures of customers' homes and the anon
-- key ships in the browser bundle — a public bucket means anyone with a URL
-- can enumerate them. Files are served through short-lived signed URLs
-- generated server-side; the tables store the storage PATH, never a signed URL.
-- Path convention: {bucket}/{deal_id}/{filename}
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('quotes',       'quotes',       false, 26214400),   -- 25 MB: Excel, PDF, image
  ('visit-photos', 'visit-photos', false,  2097152)    -- 2 MB: compressed client-side to ~300KB
on conflict (id) do nothing;

-- The first path segment is the deal id; scope access through that deal.
create or replace function storage_deal_id(name text) returns uuid as $$
declare seg text;
begin
  seg := split_part(name, '/', 1);
  if seg !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
  return seg::uuid;
exception when others then return null;
end;
$$ language plpgsql immutable;

create policy storage_read on storage.objects for select
  using (
    bucket_id in ('quotes','visit-photos')
    and (
      is_staff()
      or exists (select 1 from deals d
                 where d.id = storage_deal_id(storage.objects.name)
                 and d.rep_owner_id = auth.uid())
    )
  );

create policy storage_insert on storage.objects for insert
  with check (
    bucket_id in ('quotes','visit-photos')
    and (
      is_staff()
      or exists (select 1 from deals d
                 where d.id = storage_deal_id(storage.objects.name)
                 and d.rep_owner_id = auth.uid())
    )
  );

-- Only admins remove stored files. A rep re-uploading should add, not replace.
create policy storage_delete on storage.objects for delete
  using (bucket_id in ('quotes','visit-photos') and is_admin());
