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
