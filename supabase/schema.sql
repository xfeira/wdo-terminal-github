-- Execute no SQL Editor do Supabase
create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dir text not null check (dir in ('C','V')),
  qty int not null default 1,
  entry numeric not null,
  stop numeric,
  exit numeric not null,
  pts numeric not null,
  brl numeric not null,
  r numeric default 0,
  setup text
);
create table if not exists scores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  score int not null,
  price numeric not null
);
alter table trades enable row level security;
alter table scores enable row level security;
