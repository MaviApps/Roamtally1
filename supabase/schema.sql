-- RoamTally (Powered by MaVi / Mavi Solution) — Supabase PostgreSQL Schema & Row Level Security
-- Paste and run this entire script once in: Supabase Dashboard -> SQL Editor -> New Query

-- 1. User Profiles
create table if not exists public.profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  mascot_id text not null default 'mavi-pelican' check (mascot_id in ('mavi-pelican', 'pip-otter', 'sunny-fox', 'milo-bear')),
  theme_accent text not null default 'coastal-teal' check (theme_accent in ('coastal-teal', 'sunset-coral')),
  license_tier text not null default 'free' check (license_tier in ('free', 'solo', 'group5')),
  referral_code text not null check (char_length(referral_code) between 4 and 24),
  referred_by text,
  referral_count integer not null default 0 check (referral_count >= 0 and referral_count <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. User Billing & Subscription Cycle (Monthly $1.99 / 6-Month Pass $9.99 / Lifetime Vault $14.99)
create table if not exists public.user_billing (
  uid uuid primary key references auth.users(id) on delete cascade,
  license_tier text not null default 'free' check (license_tier in ('free', 'solo', 'group5')),
  license_price_paid numeric(10, 2) not null default 0 check (license_price_paid >= 0 and license_price_paid <= 100),
  monthly_sync_active boolean not null default true,
  monthly_sync_price numeric(10, 2) not null default 1.99 check (monthly_sync_price >= 0 and monthly_sync_price <= 50),
  lifetime_vault_unlocked boolean not null default false,
  lifetime_vault_price numeric(10, 2) not null default 14.99 check (lifetime_vault_price >= 0 and lifetime_vault_price <= 100),
  history_retention_days integer not null default 180 check (history_retention_days >= 0 and history_retention_days <= 36500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Trips
create table if not exists public.trips (
  trip_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_ids uuid[] not null default '{}',
  title text not null check (char_length(title) between 1 and 120),
  origin text not null check (char_length(origin) between 1 and 100),
  destination text not null check (char_length(destination) between 1 and 100),
  start_date text not null,
  end_date text not null,
  currency text not null default 'USD' check (char_length(currency) between 3 and 8),
  total_budget numeric(12, 2) not null default 0 check (total_budget >= 0),
  join_code text not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed')),
  is_historical_archive boolean not null default false,
  weather_summary text not null default '',
  flight_update_summary text not null default '',
  tourist_spots jsonb not null default '[]'::jsonb,
  required_docs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Trip Members
create table if not exists public.trip_members (
  member_id text primary key,
  trip_id text not null references public.trips(trip_id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  mascot_id text not null default 'mavi-pelican',
  role text not null default 'traveler' check (role in ('organizer', 'traveler')),
  budget_limit numeric(12, 2) not null default 0 check (budget_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Itinerary Items
create table if not exists public.itinerary_items (
  item_id text primary key,
  trip_id text not null references public.trips(trip_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  category text not null check (category in ('flight', 'train', 'lodging', 'activity', 'dining', 'transport')),
  date_time text not null,
  location text not null default '',
  notes text not null default '',
  reminder_minutes_before integer not null default 60,
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  paid_by_member_id text not null,
  split_method text not null default 'equal' check (split_method in ('equal', 'exact', 'percentage')),
  linked_expense_id text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'boarding', 'completed')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. Expenses (Solo Personal Expense Manager + Group Splitwise Ledger)
create table if not exists public.expenses (
  expense_id text primary key,
  trip_id text not null references public.trips(trip_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  category text not null,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  currency text not null default 'USD',
  paid_by_member_id text not null,
  split_method text not null default 'equal' check (split_method in ('equal', 'exact', 'percentage', 'settlement')),
  shares jsonb not null default '[]'::jsonb,
  linked_itinerary_id text not null default '',
  date text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. Encrypted Travel Wallet Docs (Bills, Flight Tickets, Itineraries, Insurance, Passports)
create table if not exists public.encrypted_docs (
  doc_id text primary key,
  trip_id text not null references public.trips(trip_id) on delete cascade,
  sender_uid uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  doc_category text not null check (doc_category in ('passport', 'visa', 'insurance', 'customs', 'ticket', 'note')),
  title text not null check (char_length(title) between 1 and 120),
  ciphertext text not null check (char_length(ciphertext) <= 8000),
  iv text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8. Offline Map Packs
create table if not exists public.offline_map_packs (
  pack_id text primary key,
  trip_id text not null references public.trips(trip_id) on delete cascade,
  destination text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  zoom_level integer not null default 12,
  pins jsonb not null default '[]'::jsonb,
  downloaded_by_uid uuid not null references auth.users(id) on delete cascade,
  size_kb integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helper function for RLS trip membership checks
create or replace function public.is_trip_member(p_trip_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.trips
    where trip_id = p_trip_id
      and auth.uid() = any(member_ids)
  );
$$;

-- Enable Row Level Security on all tables
alter table public.profiles enable row level security;
alter table public.user_billing enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.expenses enable row level security;
alter table public.encrypted_docs enable row level security;
alter table public.offline_map_packs enable row level security;

-- Profiles RLS
drop policy if exists "profiles_owner_all" on public.profiles;
create policy "profiles_owner_all" on public.profiles
  for all using (auth.uid() = uid) with check (auth.uid() = uid);

-- Billing RLS
drop policy if exists "billing_owner_all" on public.user_billing;
create policy "billing_owner_all" on public.user_billing
  for all using (auth.uid() = uid) with check (auth.uid() = uid);

-- Trips RLS
drop policy if exists "trips_member_select" on public.trips;
create policy "trips_member_select" on public.trips
  for select using (auth.uid() = any(member_ids));

drop policy if exists "trips_owner_insert" on public.trips;
create policy "trips_owner_insert" on public.trips
  for insert with check (auth.uid() = owner_id and auth.uid() = any(member_ids));

drop policy if exists "trips_member_update" on public.trips;
create policy "trips_member_update" on public.trips
  for update using (auth.uid() = any(member_ids)) with check (auth.uid() = any(member_ids));

drop policy if exists "trips_owner_delete" on public.trips;
create policy "trips_owner_delete" on public.trips
  for delete using (auth.uid() = owner_id);

-- Sub-resource RLS (Members, Itinerary, Expenses, Encrypted Docs, Offline Maps)
drop policy if exists "trip_members_access" on public.trip_members;
create policy "trip_members_access" on public.trip_members
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists "itinerary_access" on public.itinerary_items;
create policy "itinerary_access" on public.itinerary_items
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists "expenses_access" on public.expenses;
create policy "expenses_access" on public.expenses
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists "encrypted_docs_access" on public.encrypted_docs;
create policy "encrypted_docs_access" on public.encrypted_docs
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists "offline_packs_access" on public.offline_map_packs;
create policy "offline_packs_access" on public.offline_map_packs
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- Helpful indexes
create index if not exists idx_trips_member_ids on public.trips using gin (member_ids);
create index if not exists idx_trip_members_trip on public.trip_members (trip_id);
create index if not exists idx_itinerary_trip on public.itinerary_items (trip_id, date_time);
create index if not exists idx_expenses_trip on public.expenses (trip_id, created_at desc);
create index if not exists idx_docs_trip on public.encrypted_docs (trip_id, created_at desc);
create index if not exists idx_packs_trip on public.offline_map_packs (trip_id);
