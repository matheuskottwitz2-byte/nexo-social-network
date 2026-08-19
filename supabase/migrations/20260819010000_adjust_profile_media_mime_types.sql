-- Nexo - align accepted profile media formats with the current upload flows

begin;

-- These buckets are created by earlier migrations. Failing explicitly keeps a
-- partially initialized database from silently accepting this configuration.
do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'avatars'
  ) then
    raise exception 'Expected storage bucket "avatars" does not exist.';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'covers'
  ) then
    raise exception 'Expected storage bucket "covers" does not exist.';
  end if;
end;
$$;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif'
    ]::text[]
where id = 'avatars';

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif'
    ]::text[]
where id = 'covers';

commit;
