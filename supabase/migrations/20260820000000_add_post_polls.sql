-- Nexo - normalized polls for posts

begin;

-- -----------------------------------------------------------------------------
-- Poll schema and relational invariants
-- -----------------------------------------------------------------------------

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  author_id uuid not null,
  question text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint polls_post_key
    unique (post_id),
  constraint polls_post_author_fkey
    foreign key (post_id, author_id)
    references public.posts (id, author_id)
    on delete cascade,
  constraint polls_question_length
    check (
      question = btrim(regexp_replace(question, '[[:space:]]+', ' ', 'g'))
      and char_length(question) between 1 and 280
    ),
  constraint polls_expiration_valid
    check (expires_at > created_at)
);

comment on table public.polls is
  'At most one normalized poll per post. Poll ownership always matches the post author.';
comment on column public.polls.expires_at is
  'Database-authoritative deadline after which vote_in_poll rejects new votes.';

create index polls_author_created_idx
  on public.polls (author_id, created_at desc);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_text text not null,
  position smallint not null,
  created_at timestamptz not null default now(),

  constraint poll_options_poll_id_id_key
    unique (poll_id, id),
  constraint poll_options_position_key
    unique (poll_id, position),
  constraint poll_options_text_length
    check (
      option_text = btrim(regexp_replace(option_text, '[[:space:]]+', ' ', 'g'))
      and char_length(option_text) between 1 and 80
    ),
  constraint poll_options_position_valid
    check (position between 0 and 3)
);

comment on table public.poll_options is
  'Ordered poll choices. Deferred validation requires two to four contiguous positions.';

create unique index poll_options_normalized_text_key
  on public.poll_options (
    poll_id,
    lower(btrim(regexp_replace(option_text, '[[:space:]]+', ' ', 'g')))
  );

create table public.poll_votes (
  poll_id uuid not null,
  option_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint poll_votes_pkey
    primary key (poll_id, user_id),
  constraint poll_votes_option_fkey
    foreign key (poll_id, option_id)
    references public.poll_options (poll_id, id)
    on delete cascade
);

comment on table public.poll_votes is
  'One immutable vote per user and poll. Voter identities are not exposed through the browser API.';

create index poll_votes_poll_option_idx
  on public.poll_votes (poll_id, option_id);

-- A poll and image attachments are mutually exclusive. Locking the parent post
-- serializes concurrent attempts so two transactions cannot each observe the
-- other asset as absent and commit both kinds of attachment.
create or replace function public.enforce_post_asset_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.posts as post
  where post.id = new.post_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The referenced post does not exist.';
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'polls' then
    if exists (
      select 1
      from public.post_media as media
      where media.post_id = new.post_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'A post cannot contain both media and a poll.';
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'post_media' then
    if exists (
      select 1
      from public.polls as poll
      where poll.post_id = new.post_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'A post cannot contain both media and a poll.';
    end if;
  else
    raise exception using
      errcode = '55000',
      message = 'Unexpected trigger source for post asset validation.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_post_asset_exclusivity()
from public, anon, authenticated;

create trigger polls_reject_post_media
before insert on public.polls
for each row
execute function public.enforce_post_asset_exclusivity();

create trigger post_media_reject_polls
before insert on public.post_media
for each row
execute function public.enforce_post_asset_exclusivity();

-- The poll row is inserted before its options by the atomic creation RPC. A
-- deferred check therefore validates the final transaction state rather than
-- rejecting that safe intermediate state.
create or replace function public.enforce_poll_option_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_poll_ids uuid[];
  affected_poll_id uuid;
  current_option_count integer;
  minimum_position smallint;
  maximum_position smallint;
begin
  if tg_table_schema = 'public' and tg_table_name = 'polls' then
    affected_poll_ids := array[new.id];
  elsif tg_table_schema = 'public' and tg_table_name = 'poll_options' then
    if tg_op = 'INSERT' then
      affected_poll_ids := array[new.poll_id];
    elsif tg_op = 'DELETE' then
      affected_poll_ids := array[old.poll_id];
    else
      affected_poll_ids := array[old.poll_id, new.poll_id];
    end if;
  else
    raise exception using
      errcode = '55000',
      message = 'Unexpected trigger source for poll option validation.';
  end if;

  foreach affected_poll_id in array affected_poll_ids loop
    -- During a poll/post cascade the parent no longer exists, so there is no
    -- surviving poll whose option count needs validation.
    if exists (
      select 1
      from public.polls as poll
      where poll.id = affected_poll_id
    ) then
      select
        count(*)::integer,
        min(option.position),
        max(option.position)
      into
        current_option_count,
        minimum_position,
        maximum_position
      from public.poll_options as option
      where option.poll_id = affected_poll_id;

      if current_option_count not between 2 and 4
         or minimum_position <> 0
         or maximum_position <> current_option_count - 1 then
        raise exception using
          errcode = '23514',
          message = 'A poll must contain two to four ordered options.';
      end if;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.enforce_poll_option_count()
from public, anon, authenticated;

create constraint trigger polls_require_options
after insert on public.polls
deferrable initially deferred
for each row
execute function public.enforce_poll_option_count();

create constraint trigger poll_options_preserve_valid_count
after insert or update or delete on public.poll_options
deferrable initially deferred
for each row
execute function public.enforce_poll_option_count();

-- Extend the existing post invariant forward-only: a post may now be backed by
-- text, image media, or a poll. Deleting a poll directly from an empty post is
-- rejected, while post deletion cascades safely because no parent remains.
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
  elsif tg_table_schema = 'public' and tg_table_name = 'polls' then
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
      and not exists (
        select 1
        from public.polls as poll
        where poll.post_id = post.id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'A post must contain text, media, or a poll.';
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_post_has_content_or_media()
from public, anon, authenticated;

create constraint trigger polls_preserve_nonempty_post
after delete on public.polls
deferrable initially deferred
for each row
execute function public.enforce_post_has_content_or_media();

-- Expiration is checked again at the table boundary. This makes the invariant
-- independent of timing between the RPC's friendly validation and the INSERT.
create or replace function public.enforce_poll_vote_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll_expires_at timestamptz;
begin
  select poll.expires_at
  into poll_expires_at
  from public.polls as poll
  where poll.id = new.poll_id
  for key share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The referenced poll does not exist.';
  end if;

  if poll_expires_at <= clock_timestamp() then
    raise exception using
      errcode = '23514',
      message = 'This poll has expired.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_poll_vote_deadline()
from public, anon, authenticated;

create trigger poll_votes_enforce_deadline
before insert on public.poll_votes
for each row
execute function public.enforce_poll_vote_deadline();

-- -----------------------------------------------------------------------------
-- Row Level Security and least-privilege grants
-- -----------------------------------------------------------------------------

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy "Polls are publicly readable"
on public.polls for select
to anon, authenticated
using (
  exists (
    select 1
    from public.posts as post
    where post.id = polls.post_id
  )
);

create policy "Poll options are publicly readable"
on public.poll_options for select
to anon, authenticated
using (
  exists (
    select 1
    from public.polls as poll
    join public.posts as post on post.id = poll.post_id
    where poll.id = poll_options.poll_id
  )
);

-- There is intentionally no SELECT policy for poll_votes. This policy is only
-- defense in depth for the authenticated user's identity; browser INSERT is
-- not granted and all real votes go through vote_in_poll.
create policy "Users may only cast their own poll vote"
on public.poll_votes for insert
to authenticated
with check (user_id = (select auth.uid()));

revoke all on table
  public.polls,
  public.poll_options,
  public.poll_votes
from public, anon, authenticated;

grant select on table
  public.polls,
  public.poll_options
to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Atomic post and poll creation
-- -----------------------------------------------------------------------------

create or replace function public.create_post_with_media(
  p_post_id uuid,
  p_content text,
  p_media jsonb,
  p_poll jsonb
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
  normalized_poll jsonb := case
    when p_poll is null or p_poll = 'null'::jsonb then null
    else p_poll
  end;
  media_count integer;
  poll_question text;
  poll_duration_text text;
  poll_duration_minutes integer;
  poll_options jsonb;
  poll_option_count integer;
  created_poll_id uuid;
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

  if exists (
    select 1
    from jsonb_array_elements(normalized_media) as media_element(value)
    where jsonb_typeof(media_element.value) <> 'object'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Every post media entry must be a JSON object.';
  end if;

  if normalized_poll is not null then
    if jsonb_typeof(normalized_poll) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'Post poll must be a JSON object or null.';
    end if;

    if media_count > 0 then
      raise exception using
        errcode = '23514',
        message = 'A post cannot contain both media and a poll.';
    end if;

    if jsonb_typeof(normalized_poll -> 'question') is distinct from 'string' then
      raise exception using
        errcode = '22023',
        message = 'Poll question must be a string.';
    end if;

    poll_question := btrim(regexp_replace(
      normalized_poll ->> 'question',
      '[[:space:]]+',
      ' ',
      'g'
    ));
    if char_length(poll_question) not between 1 and 280 then
      raise exception using
        errcode = '22023',
        message = 'Poll question must contain between 1 and 280 characters.';
    end if;

    if jsonb_typeof(normalized_poll -> 'duration_minutes') is distinct from 'number' then
      raise exception using
        errcode = '22023',
        message = 'Poll duration_minutes must be an integer.';
    end if;

    poll_duration_text := normalized_poll ->> 'duration_minutes';
    if char_length(poll_duration_text) > 5
       or poll_duration_text !~ '^[0-9]+$' then
      raise exception using
        errcode = '22023',
        message = 'Poll duration_minutes must be an integer.';
    end if;

    poll_duration_minutes := poll_duration_text::integer;
    if poll_duration_minutes not in (60, 360, 1440, 4320, 10080) then
      raise exception using
        errcode = '22023',
        message = 'Poll duration must be 60, 360, 1440, 4320, or 10080 minutes.';
    end if;

    poll_options := normalized_poll -> 'options';
    if jsonb_typeof(poll_options) is distinct from 'array' then
      raise exception using
        errcode = '22023',
        message = 'Poll options must be a JSON array.';
    end if;

    poll_option_count := jsonb_array_length(poll_options);
    if poll_option_count not between 2 and 4 then
      raise exception using
        errcode = '23514',
        message = 'A poll must contain between two and four options.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(poll_options) as option_element(value)
      where jsonb_typeof(option_element.value) <> 'string'
         or char_length(btrim(regexp_replace(
           option_element.value #>> '{}',
           '[[:space:]]+',
           ' ',
           'g'
         ))) not between 1 and 80
    ) then
      raise exception using
        errcode = '22023',
        message = 'Every poll option must contain between 1 and 80 characters.';
    end if;

    if (
      select count(distinct lower(btrim(regexp_replace(
        option_element.value #>> '{}',
        '[[:space:]]+',
        ' ',
        'g'
      ))))
      from jsonb_array_elements(poll_options) as option_element(value)
    ) <> poll_option_count then
      raise exception using
        errcode = '23514',
        message = 'Poll options must be distinct.';
    end if;
  end if;

  if normalized_content = '' and media_count = 0 and normalized_poll is null then
    raise exception using
      errcode = '23514',
      message = 'A post must contain text, at least one image, or a poll.';
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

  if normalized_poll is not null then
    insert into public.polls (
      post_id,
      author_id,
      question,
      expires_at
    )
    values (
      p_post_id,
      authenticated_user_id,
      poll_question,
      statement_timestamp() + make_interval(mins => poll_duration_minutes)
    )
    returning id into created_poll_id;

    insert into public.poll_options (poll_id, option_text, position)
    select
      created_poll_id,
      btrim(regexp_replace(
        option_element.value #>> '{}',
        '[[:space:]]+',
        ' ',
        'g'
      )),
      (option_element.ordinality - 1)::smallint
    from jsonb_array_elements(poll_options) with ordinality
      as option_element(value, ordinality);
  end if;

  return p_post_id;
end;
$$;

comment on function public.create_post_with_media(uuid, text, jsonb, jsonb) is
  'Atomically creates an authenticated post with either up to four images or one poll. Poll JSON uses question, duration_minutes, and a two-to-four-string options array.';

-- Preserve the exact existing RPC contract for text/media clients. Keeping the
-- fourth argument non-defaulted avoids ambiguous three-argument resolution.
create or replace function public.create_post_with_media(
  p_post_id uuid,
  p_content text,
  p_media jsonb default '[]'::jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_post_with_media(
    p_post_id,
    p_content,
    p_media,
    null::jsonb
  );
$$;

comment on function public.create_post_with_media(uuid, text, jsonb) is
  'Backward-compatible atomic text/media post creation wrapper.';

revoke all on function public.create_post_with_media(uuid, text, jsonb, jsonb)
from public, anon, authenticated;
revoke all on function public.create_post_with_media(uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function public.create_post_with_media(uuid, text, jsonb, jsonb)
to authenticated;
grant execute on function public.create_post_with_media(uuid, text, jsonb)
to authenticated;

-- -----------------------------------------------------------------------------
-- Voting and aggregate reads
-- -----------------------------------------------------------------------------

create or replace function public.vote_in_poll(
  p_poll_id uuid,
  p_option_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid;
  poll_expires_at timestamptz;
begin
  authenticated_user_id := (select auth.uid());

  if authenticated_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to vote.';
  end if;

  if p_poll_id is null or p_option_id is null then
    raise exception using
      errcode = '22004',
      message = 'A poll id and option id are required.';
  end if;

  select poll.expires_at
  into poll_expires_at
  from public.polls as poll
  where poll.id = p_poll_id
  for key share;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Poll not found.';
  end if;

  if poll_expires_at <= clock_timestamp() then
    raise exception using
      errcode = '23514',
      message = 'This poll has expired.';
  end if;

  if not exists (
    select 1
    from public.poll_options as option
    where option.poll_id = p_poll_id
      and option.id = p_option_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'The selected option does not belong to this poll.';
  end if;

  insert into public.poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, authenticated_user_id);

  return p_option_id;
end;
$$;

comment on function public.vote_in_poll(uuid, uuid) is
  'Casts one final authenticated vote before expiration. The authenticated user id is never accepted as input.';

revoke all on function public.vote_in_poll(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.vote_in_poll(uuid, uuid)
to authenticated;

create or replace function public.get_poll_summaries(
  p_post_ids uuid[]
)
returns table (
  post_id uuid,
  poll_id uuid,
  question text,
  expires_at timestamptz,
  total_votes bigint,
  viewer_option_id uuid,
  options jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with requested_polls as (
    select
      poll.id,
      poll.post_id,
      poll.question,
      poll.expires_at
    from public.polls as poll
    where poll.post_id = any(coalesce(p_post_ids, array[]::uuid[]))
  ),
  option_counts as (
    select
      option.poll_id,
      option.id as option_id,
      option.option_text,
      option.position,
      count(vote.user_id)::bigint as vote_count
    from public.poll_options as option
    join requested_polls as poll on poll.id = option.poll_id
    left join public.poll_votes as vote
      on vote.poll_id = option.poll_id
     and vote.option_id = option.id
    group by
      option.poll_id,
      option.id,
      option.option_text,
      option.position
  ),
  viewer_votes as (
    select vote.poll_id, vote.option_id
    from public.poll_votes as vote
    join requested_polls as poll on poll.id = vote.poll_id
    where vote.user_id = (select auth.uid())
  )
  select
    poll.post_id,
    poll.id as poll_id,
    poll.question,
    poll.expires_at,
    coalesce(sum(option.vote_count), 0)::bigint as total_votes,
    viewer_vote.option_id as viewer_option_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', option.option_id,
          'text', option.option_text,
          'position', option.position,
          'vote_count', option.vote_count
        )
        order by option.position
      ),
      '[]'::jsonb
    ) as options
  from requested_polls as poll
  join option_counts as option on option.poll_id = poll.id
  left join viewer_votes as viewer_vote on viewer_vote.poll_id = poll.id
  group by
    poll.post_id,
    poll.id,
    poll.question,
    poll.expires_at,
    viewer_vote.option_id
  order by poll.post_id;
$$;

comment on function public.get_poll_summaries(uuid[]) is
  'Returns one aggregate row per requested post poll, including option counts and only the caller own selected option; voter identities are never returned.';

revoke all on function public.get_poll_summaries(uuid[])
from public, anon, authenticated;

grant execute on function public.get_poll_summaries(uuid[])
to anon, authenticated;

commit;
