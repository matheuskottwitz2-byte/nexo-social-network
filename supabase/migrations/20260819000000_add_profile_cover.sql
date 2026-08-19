-- Nexo - profile cover images

begin;

-- Keep cover URLs subject to the same bounded length used for avatar URLs.
alter table public.profiles
  add column cover_url text,
  add constraint profiles_cover_url_length
    check (cover_url is null or char_length(cover_url) <= 2048);

comment on column public.profiles.cover_url is
  'Public URL of the profile cover image stored in the covers bucket.';

-- The existing profile UPDATE policy still restricts changes to auth.uid() = id.
-- Column-level privileges keep id, username, and timestamps unavailable to the
-- browser while adding only cover_url to the editable profile fields.
grant update (cover_url)
on public.profiles to authenticated;

-- Covers are publicly readable but accept only static web image formats.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'covers',
  'covers',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Objects must use the path "<auth.uid()>/<filename>". Reads are public;
-- authenticated users can mutate only objects inside their own first folder.
create policy "Cover images are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'covers');

create policy "Users can upload covers to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update covers in their own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete covers in their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
