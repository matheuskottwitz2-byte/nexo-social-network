-- Nexo - normalized image attachments for posts

begin;

-- Image-only posts need an empty content value while the authenticated creation
-- RPC below remains responsible for rejecting posts that have neither text nor
-- media. Trimming in the RPC keeps every newly created value within this bound.
alter table public.posts
  drop constraint posts_content_length,
  add constraint posts_content_length
    check (char_length(btrim(content)) <= 500);

comment on column public.posts.image_url is
  'Deprecated legacy image URL. New post attachments are stored in post_media; this column is retained for read-only compatibility.';

-- The composite key lets post_media enforce that its owner is also the author
-- of the referenced post without relying exclusively on RLS.
alter table public.posts
  add constraint posts_id_author_id_key unique (id, author_id);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  owner_id uuid not null,
  media_type text not null default 'image',
  storage_path text not null,
  mime_type text not null,
  width integer not null,
  height integer not null,
  position smallint not null,
  alt_text text,
  created_at timestamptz not null default now(),

  constraint post_media_post_owner_fkey
    foreign key (post_id, owner_id)
    references public.posts (id, author_id)
    on delete cascade,
  constraint post_media_media_type_supported
    check (media_type = 'image'),
  constraint post_media_mime_type_supported
    check (mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif'
    )),
  constraint post_media_width_valid
    check (width between 1 and 32768),
  constraint post_media_height_valid
    check (height between 1 and 32768),
  constraint post_media_position_valid
    check (position between 0 and 3),
  constraint post_media_post_position_key
    unique (post_id, position),
  constraint post_media_storage_path_key
    unique (storage_path),
  constraint post_media_storage_path_valid
    check (
      char_length(storage_path) <= 1024
      and storage_path ~ (
        '^'
        || owner_id::text
        || '/'
        || post_id::text
        || '/[^/]+$'
      )
    ),
  constraint post_media_alt_text_length
    check (alt_text is null or char_length(alt_text) <= 1000)
);

comment on table public.post_media is
  'Ordered post attachments. Storage paths are authoritative; public URLs are derived from the public post-media bucket.';
comment on column public.post_media.position is
  'Zero-based display order. The 0-3 bound and per-post uniqueness limit posts to four attachments.';
comment on column public.post_media.alt_text is
  'Optional author-provided alternative text; filenames are never used as a fallback.';

create index post_media_owner_created_idx
  on public.post_media (owner_id, created_at desc);

-- Keep "text or media" as a database invariant without forcing the browser to
-- create an incomplete row between requests. Deferred checks see the final
-- transaction state, so the creation RPC may insert the post before its media,
-- while deleting the final attachment from an image-only post is rejected.
-- Locking the parent before a direct media deletion also prevents concurrent
-- transactions from each observing a different attachment and deleting both.
create or replace function public.lock_post_for_media_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.posts as post
  where post.id = old.post_id
  for update;

  return old;
end;
$$;

revoke all on function public.lock_post_for_media_delete()
from public, anon, authenticated;

create trigger post_media_serialize_deletes
before delete on public.post_media
for each row
execute function public.lock_post_for_media_delete();

create or replace function public.enforce_post_has_content_or_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_post_id uuid;
begin
  if tg_table_schema = 'public' and tg_table_name = 'posts' then
    affected_post_id := new.id;
  elsif tg_table_schema = 'public' and tg_table_name = 'post_media' then
    affected_post_id := old.post_id;
  else
    raise exception using
      errcode = '55000',
      message = 'Unexpected trigger source for post content validation.';
  end if;

  if exists (
    select 1
    from public.posts as post
    where post.id = affected_post_id
      and btrim(post.content) = ''
      and not exists (
        select 1
        from public.post_media as media
        where media.post_id = post.id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'A post must contain text or at least one media item.';
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_post_has_content_or_media()
from public, anon, authenticated;

create constraint trigger posts_require_content_or_media
after insert or update on public.posts
deferrable initially deferred
for each row
execute function public.enforce_post_has_content_or_media();

create constraint trigger post_media_preserve_nonempty_post
after delete on public.post_media
deferrable initially deferred
for each row
execute function public.enforce_post_has_content_or_media();

-- -----------------------------------------------------------------------------
-- Row Level Security and least-privilege grants
-- -----------------------------------------------------------------------------

alter table public.post_media enable row level security;

create policy "Post media is publicly readable"
on public.post_media for select
to anon, authenticated
using (
  exists (
    select 1
    from public.posts as post
    where post.id = post_media.post_id
  )
);

create policy "Users can attach media to their own posts"
on public.post_media for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.posts as post
    where post.id = post_media.post_id
      and post.author_id = (select auth.uid())
  )
);

create policy "Users can remove media from their own posts"
on public.post_media for delete
to authenticated
using (owner_id = (select auth.uid()));

revoke all on table public.post_media
from public, anon, authenticated;

grant select on table public.post_media
to anon, authenticated;

grant insert (
  post_id,
  owner_id,
  media_type,
  storage_path,
  mime_type,
  width,
  height,
  position,
  alt_text
)
on public.post_media to authenticated;

grant delete on table public.post_media
to authenticated;

-- -----------------------------------------------------------------------------
-- Public post-media storage
-- -----------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'post-media',
  'post-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Post media objects are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'post-media');

-- Uploads precede the atomic database RPC, so the post UUID need not exist yet.
-- The browser generates both UUIDs and filenames; Storage only accepts the
-- exact shape "<auth.uid()>/<post-id>/<filename>" in the user's own folder.
create policy "Users can upload post media to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce(array_length(storage.foldername(name), 1), 0) = 2
  and (storage.foldername(name))[2] ~* (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

-- Deletion depends only on the owner folder so failed publication cleanup can
-- still remove an uploaded object when no posts row was ever committed.
create policy "Users can delete post media from their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce(array_length(storage.foldername(name), 1), 0) = 2
);

-- -----------------------------------------------------------------------------
-- Atomic post creation
-- -----------------------------------------------------------------------------

create or replace function public.create_post_with_media(
  p_post_id uuid,
  p_content text,
  p_media jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid;
  normalized_content text := btrim(coalesce(p_content, ''));
  normalized_media jsonb := coalesce(p_media, '[]'::jsonb);
  media_count integer;
begin
  authenticated_user_id := (select auth.uid());

  if authenticated_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to create a post.';
  end if;

  if p_post_id is null then
    raise exception using
      errcode = '22004',
      message = 'A post id is required.';
  end if;

  if char_length(normalized_content) > 500 then
    raise exception using
      errcode = '22001',
      message = 'Post content cannot exceed 500 characters.';
  end if;

  if jsonb_typeof(normalized_media) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'Post media must be a JSON array.';
  end if;

  media_count := jsonb_array_length(normalized_media);

  if media_count > 4 then
    raise exception using
      errcode = '23514',
      message = 'A post can contain at most four images.';
  end if;

  if normalized_content = '' and media_count = 0 then
    raise exception using
      errcode = '23514',
      message = 'A post must contain text or at least one image.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_media) as media_element(value)
    where jsonb_typeof(media_element.value) <> 'object'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Every post media entry must be a JSON object.';
  end if;

  insert into public.posts (id, author_id, content, image_url)
  values (p_post_id, authenticated_user_id, normalized_content, null);

  insert into public.post_media (
    post_id,
    owner_id,
    media_type,
    storage_path,
    mime_type,
    width,
    height,
    position,
    alt_text
  )
  select
    p_post_id,
    authenticated_user_id,
    'image',
    media.storage_path,
    lower(media.mime_type),
    media.width,
    media.height,
    media.position,
    nullif(btrim(media.alt_text), '')
  from jsonb_to_recordset(normalized_media) as media (
    storage_path text,
    mime_type text,
    width integer,
    height integer,
    position smallint,
    alt_text text
  );

  return p_post_id;
end;
$$;

comment on function public.create_post_with_media(uuid, text, jsonb) is
  'Atomically creates an authenticated user post and up to four normalized media rows. Uploaded objects must already exist and are cleaned up by the client if this transaction fails.';

revoke all on function public.create_post_with_media(uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function public.create_post_with_media(uuid, text, jsonb)
to authenticated;

-- All browser post creation now goes through the atomic RPC. Existing SELECT
-- and DELETE privileges remain unchanged; no browser role may edit published
-- content or write the deprecated image_url column directly.
revoke insert (author_id, content, image_url)
on public.posts from authenticated;

revoke update (content, image_url)
on public.posts from authenticated;

commit;
