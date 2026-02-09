-- JAY GENT ARCADE - Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  constraint username_length check (char_length(username) >= 2 and char_length(username) <= 20),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]+$')
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================
-- FOLLOWS (social graph)
-- ============================================

create table public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id != following_id)
);

-- Enable RLS
alter table public.follows enable row level security;

-- Policies
create policy "Follows are viewable by everyone"
  on public.follows for select
  using (true);

create policy "Users can follow others"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- ============================================
-- SCORES (updated with user linking)
-- ============================================

create table public.scores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  guest_name text, -- for non-logged-in players (3 char initials)
  score integer not null,
  wave integer not null,
  game text not null default 'void-rush',
  player_type text not null default 'HUMAN', -- HUMAN or AGENT
  duration_ms integer,
  created_at timestamptz default now(),
  
  constraint valid_score check (score >= 0),
  constraint valid_wave check (wave >= 1)
);

-- Enable RLS
alter table public.scores enable row level security;

-- Policies
create policy "Scores are viewable by everyone"
  on public.scores for select
  using (true);

create policy "Anyone can insert scores"
  on public.scores for insert
  with check (true);

-- ============================================
-- INDEXES
-- ============================================

create index idx_scores_score on public.scores(score desc);
create index idx_scores_user on public.scores(user_id);
create index idx_scores_created on public.scores(created_at desc);
create index idx_follows_follower on public.follows(follower_id);
create index idx_follows_following on public.follows(following_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'preferred_username',  -- GitHub, X
      new.raw_user_meta_data->>'user_name',           -- X alt
      split_part(new.email, '@', 1)                   -- fallback to email prefix
    ),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  );
  return new;
exception when unique_violation then
  -- Username taken, append random suffix
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    split_part(new.email, '@', 1) || '_' || substr(gen_random_uuid()::text, 1, 4),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new signups
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Get follower count
create or replace function public.get_follower_count(profile_id uuid)
returns integer as $$
  select count(*)::integer from public.follows where following_id = profile_id;
$$ language sql stable;

-- Get following count
create or replace function public.get_following_count(profile_id uuid)
returns integer as $$
  select count(*)::integer from public.follows where follower_id = profile_id;
$$ language sql stable;

-- Check if user follows another
create or replace function public.is_following(follower uuid, target uuid)
returns boolean as $$
  select exists(
    select 1 from public.follows 
    where follower_id = follower and following_id = target
  );
$$ language sql stable;

-- ============================================
-- VIEWS
-- ============================================

-- Leaderboard view with profile info
create or replace view public.leaderboard as
select 
  s.id,
  s.score,
  s.wave,
  s.game,
  s.player_type,
  s.created_at,
  s.user_id,
  coalesce(p.username, s.guest_name, 'AAA') as name,
  p.avatar_url,
  p.display_name
from public.scores s
left join public.profiles p on s.user_id = p.id
order by s.score desc;
