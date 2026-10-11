-- ==============================================================================
-- SmartSpend — Complete Supabase PostgreSQL Schema & Security Migration
-- Idempotent script: Safe to run repeatedly
-- Tables: profiles, transactions, budgets
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "pgcrypto";

-- ==============================================================================
-- 2. UPDATED_AT TRIGGER FUNCTION
-- Automatically updates updated_at column on row modification
-- ==============================================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ==============================================================================
-- 3. PROFILES TABLE
-- Extends Supabase auth.users with user preferences and financial defaults
-- ==============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'SmartSpend User',
  email text,
  currency varchar(10) not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP')),
  theme varchar(10) not null default 'light' check (theme in ('light', 'dark')),
  opening_balance numeric(14, 2) not null default 0.00 check (opening_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Policies for profiles (idempotent: drop before create)
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile"
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);

-- Trigger for updated_at on profiles
drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- Trigger to automatically create a profile entry when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger execution on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ==============================================================================
-- 4. TRANSACTIONS TABLE
-- Financial income and expense records scoped to each authenticated user
-- ==============================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type varchar(10) not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  description text not null check (length(trim(description)) > 0),
  category varchar(50) not null,
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for performance & quick dashboard filtering
create index if not exists idx_transactions_user_date on public.transactions (user_id, date desc);
create index if not exists idx_transactions_user_type on public.transactions (user_id, type);
create index if not exists idx_transactions_user_category on public.transactions (user_id, category);

-- Enable RLS on transactions
alter table public.transactions enable row level security;

-- Policies for transactions (idempotent: drop before create)
drop policy if exists "Users can view their own transactions" on public.transactions;
create policy "Users can view their own transactions"
  on public.transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own transactions" on public.transactions;
create policy "Users can insert their own transactions"
  on public.transactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own transactions" on public.transactions;
create policy "Users can update their own transactions"
  on public.transactions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own transactions" on public.transactions;
create policy "Users can delete their own transactions"
  on public.transactions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Trigger for updated_at on transactions
drop trigger if exists on_transaction_updated on public.transactions;
create trigger on_transaction_updated
  before update on public.transactions
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 5. BUDGETS TABLE
-- Monthly spending ceilings scoped to user_id and month ('YYYY-MM')
-- ==============================================================================
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month varchar(7) not null check (month ~ '^\d{4}-\d{2}$'), -- Format: 'YYYY-MM'
  amount numeric(14, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_month_budget unique (user_id, month)
);

-- Index for quick budget lookups by user and month
create index if not exists idx_budgets_user_month on public.budgets (user_id, month);

-- Enable RLS on budgets
alter table public.budgets enable row level security;

-- Policies for budgets (idempotent: drop before create)
drop policy if exists "Users can view their own budgets" on public.budgets;
create policy "Users can view their own budgets"
  on public.budgets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own budgets" on public.budgets;
create policy "Users can insert their own budgets"
  on public.budgets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own budgets" on public.budgets;
create policy "Users can update their own budgets"
  on public.budgets
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own budgets" on public.budgets;
create policy "Users can delete their own budgets"
  on public.budgets
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Trigger for updated_at on budgets
drop trigger if exists on_budget_updated on public.budgets;
create trigger on_budget_updated
  before update on public.budgets
  for each row
  execute function public.handle_updated_at();
