-- Nexo - initial Supabase schema
--
-- This migration intentionally keeps all authorization decisions in PostgreSQL.
-- The browser application only needs the Supabase Publishable Key; Secret Keys
-- and the service-role key must remain restricted to trusted server-side environments.

begin;

-- Supabase installs extensions in this dedicated schema by convention.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Core tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  name text not null,
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_format
    check (username ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_name_not_blank
    check (char_length(btrim(name)) between 1 and 80),
  constraint profiles_bio_length
    check (char_length(bio) <= 280),
  constraint profiles_avatar_url_length
    check (avatar_url is null or char_length(avatar_url) <= 2048)
);

comment on table public.profiles is
  'Public profile associated one-to-one with auth.users.';
comment on column public.profiles.username is
  'Unique lowercase handle. It is created at signup and is not editable by the client.';

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  -- Reserved for a future post-media feature. The first release may leave it null.
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint posts_content_length
    check (char_length(btrim(content)) between 1 and 500),
  constraint posts_image_url_length
    check (image_url is null or char_length(image_url) <= 2048)
);

comment on table public.posts is 'Text posts published by Nexo profiles.';

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, post_id)
);

comment on table public.likes is
  'One row per user/post pair; the composite key prevents duplicate likes.';

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comments_content_length
    check (char_length(btrim(content)) between 1 and 500)
);

comment on table public.comments is 'Comments attached to a post.';

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (follower_id, following_id),
  constraint follows_cannot_follow_self check (follower_id <> following_id)
);

comment on table public.follows is
  'Directed relationship from follower_id to following_id.';

-- -----------------------------------------------------------------------------
-- Indexes used by feeds, profiles, search, counts, and dashboard queries
-- -----------------------------------------------------------------------------

create index posts_feed_idx
  on public.posts (created_at desc, id desc);

create index posts_author_feed_idx
  on public.posts (author_id, created_at desc, id desc);

create index likes_post_created_idx
  on public.likes (post_id, created_at desc);

create index comments_post_created_idx
  on public.comments (post_id, created_at asc);

create index comments_author_created_idx
  on public.comments (author_id, created_at desc);

create index follows_following_created_idx
  on public.follows (following_id, created_at desc);

-- Trigram indexes keep contains/ILIKE searches responsive as the user base grows.
create index profiles_username_search_idx
  on public.profiles using gin (username extensions.gin_trgm_ops);

create index profiles_name_search_idx
  on public.profiles using gin (name extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Timestamp and signup triggers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Internal trigger helper that maintains updated_at.';

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  profile_username text;
  profile_name text;
  profile_avatar_url text;
begin
  requested_username := lower(
    btrim(coalesce(new.raw_user_meta_data ->> 'username', ''))
  );

  -- Email/OAuth signups may not provide a handle. UUID-derived fallbacks remain
  -- stable and effectively unique while respecting the 30-character limit.
  if requested_username = '' then
    profile_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 24);
  elsif requested_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception using
      errcode = '23514',
      message = 'username must contain 3-30 lowercase letters, numbers, or underscores';
  else
    profile_username := requested_username;
  end if;

  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    profile_username
  );
  profile_name := left(profile_name, 80);

  profile_avatar_url := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
  );

  if profile_avatar_url is not null and char_length(profile_avatar_url) > 2048 then
    profile_avatar_url := null;
  end if;

  insert into public.profiles (id, username, name, avatar_url)
  values (new.id, profile_username, profile_name, profile_avatar_url);

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the public profile atomically after a successful auth.users insert.';

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Trigger helpers are not application RPCs.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;

-- Profiles are public, but only the owner may update their editable fields.
create policy "Profiles are publicly readable"
on public.profiles for select
to anon, authenticated
using (true);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Posts are public. The author identity must always equal the authenticated user.
create policy "Posts are publicly readable"
on public.posts for select
to anon, authenticated
using (true);

create policy "Users can create their own posts"
on public.posts for insert
to authenticated
with check ((select auth.uid()) = author_id);

create policy "Authors can update their own posts"
on public.posts for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

create policy "Authors can delete their own posts"
on public.posts for delete
to authenticated
using ((select auth.uid()) = author_id);

-- Likes are readable for counters and optimistic UI reconciliation.
create policy "Likes are publicly readable"
on public.likes for select
to anon, authenticated
using (true);

create policy "Users can create their own likes"
on public.likes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can remove their own likes"
on public.likes for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Comments are public; mutations are restricted to the comment author.
create policy "Comments are publicly readable"
on public.comments for select
to anon, authenticated
using (true);

create policy "Users can create their own comments"
on public.comments for insert
to authenticated
with check ((select auth.uid()) = author_id);

create policy "Authors can update their own comments"
on public.comments for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

create policy "Authors can delete their own comments"
on public.comments for delete
to authenticated
using ((select auth.uid()) = author_id);

-- Follows are public social-graph data. Only the follower controls the edge.
create policy "Follows are publicly readable"
on public.follows for select
to anon, authenticated
using (true);

create policy "Users can follow from their own account"
on public.follows for insert
to authenticated
with check (
  (select auth.uid()) = follower_id
  and follower_id <> following_id
);

create policy "Users can remove follows from their own account"
on public.follows for delete
to authenticated
using ((select auth.uid()) = follower_id);

-- -----------------------------------------------------------------------------
-- Least-privilege API grants
-- -----------------------------------------------------------------------------

revoke all on table
  public.profiles,
  public.posts,
  public.likes,
  public.comments,
  public.follows
from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on table
  public.profiles,
  public.posts,
  public.likes,
  public.comments,
  public.follows
to anon, authenticated;

-- A profile is inserted only by handle_new_user. Username and timestamps cannot
-- be changed through the browser API.
grant update (name, bio, avatar_url)
on public.profiles to authenticated;

grant insert (author_id, content, image_url),
      update (content, image_url),
      delete
on public.posts to authenticated;

grant insert (user_id, post_id), delete
on public.likes to authenticated;

grant insert (post_id, author_id, content),
      update (content),
      delete
on public.comments to authenticated;

grant insert (follower_id, following_id), delete
on public.follows to authenticated;

-- -----------------------------------------------------------------------------
-- Dashboard RPCs
-- -----------------------------------------------------------------------------

create or replace function public.get_dashboard_stats()
returns table (
  posts_count bigint,
  likes_received bigint,
  comments_received bigint,
  followers_count bigint,
  following_count bigint,
  engagement_last_30_days bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.posts as p
      where p.author_id = (select auth.uid())
    ) as posts_count,
    (
      select count(*)
      from public.likes as l
      join public.posts as p on p.id = l.post_id
      where p.author_id = (select auth.uid())
    ) as likes_received,
    (
      select count(*)
      from public.comments as c
      join public.posts as p on p.id = c.post_id
      where p.author_id = (select auth.uid())
    ) as comments_received,
    (
      select count(*)
      from public.follows as f
      where f.following_id = (select auth.uid())
    ) as followers_count,
    (
      select count(*)
      from public.follows as f
      where f.follower_id = (select auth.uid())
    ) as following_count,
    (
      (
        select count(*)
        from public.likes as l
        join public.posts as p on p.id = l.post_id
        where p.author_id = (select auth.uid())
          and l.created_at >= now() - interval '30 days'
      )
      +
      (
        select count(*)
        from public.comments as c
        join public.posts as p on p.id = c.post_id
        where p.author_id = (select auth.uid())
          and c.created_at >= now() - interval '30 days'
      )
    ) as engagement_last_30_days;
$$;

comment on function public.get_dashboard_stats() is
  'Returns totals for the authenticated user; it never accepts another user id.';

create or replace function public.get_posts_over_time(days_back integer default 30)
returns table (
  day date,
  posts bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      greatest(1, least(coalesce(days_back, 30), 365)) as day_count,
      timezone('UTC', now())::date as utc_today
  ),
  days as (
    select generated_day::date as day
    from params
    cross join lateral generate_series(
      (params.utc_today - (params.day_count - 1))::timestamp,
      params.utc_today::timestamp,
      interval '1 day'
    ) as generated_day
  ),
  post_activity as (
    select timezone('UTC', p.created_at)::date as day,
           count(*) as posts
    from public.posts as p
    cross join params
    where p.author_id = (select auth.uid())
      and p.created_at >= (
        (params.utc_today - (params.day_count - 1))::timestamp at time zone 'UTC'
      )
    group by 1
  )
  select
    days.day,
    coalesce(post_activity.posts, 0)::bigint as posts
  from days
  left join post_activity using (day)
  order by days.day;
$$;

comment on function public.get_posts_over_time(integer) is
  'Returns a gap-free UTC daily post series for the authenticated user (1-365 days).';

revoke all on function public.get_dashboard_stats()
from public, anon, authenticated;
revoke all on function public.get_posts_over_time(integer)
from public, anon, authenticated;

grant execute on function public.get_dashboard_stats()
to authenticated;
grant execute on function public.get_posts_over_time(integer)
to authenticated;

-- -----------------------------------------------------------------------------
-- Avatar storage
-- -----------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Objects must use the path "<auth.uid()>/<filename>". A public bucket makes
-- avatar URLs usable on public profiles, while write policies isolate users.
create policy "Avatar images are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'avatars');

create policy "Users can upload avatars to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update avatars in their own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete avatars in their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
