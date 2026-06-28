-- Run this in Supabase → SQL Editor

-- Cards table: stores full card object as JSONB
create table if not exists cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  data       jsonb not null,
  created_at timestamptz default now()
);

-- Transactions table
create table if not exists transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  card_id    uuid references cards(id) on delete cascade not null,
  data       jsonb not null,
  created_at timestamptz default now()
);

-- Row Level Security: users only see their own data
alter table cards        enable row level security;
alter table transactions enable row level security;

create policy "cards_own"  on cards        for all using (auth.uid() = user_id);
create policy "txns_own"   on transactions for all using (auth.uid() = user_id);

-- Community cards: user-submitted cards, publicly readable once approved
create table if not exists community_cards (
  id           uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users,
  data         jsonb not null,
  status       text default 'pending',
  votes        int default 0,
  created_at   timestamptz default now()
);
alter table community_cards enable row level security;
create policy "community_read"   on community_cards for select using (true);
create policy "community_insert" on community_cards for insert with check (auth.uid() = submitted_by);
