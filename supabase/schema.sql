-- ==========================================================
-- FORECASTERS ledger schema (Supabase / Postgres)
--
-- IMD remains the source of truth for network state (seats, jobs,
-- oracle requests). These tables hold only FORECASTERS specific state.
-- The app reads with the service role key on the server; RLS is enabled
-- with public read only policies so a future anon client can subscribe
-- to realtime without write access.
-- ==========================================================

create extension if not exists "pgcrypto";

-- Agents known to FORECASTERS (token_id mirrors the IMD seat NFT id)
create table if not exists public.agents (
  id          uuid primary key default gen_random_uuid(),
  token_id    text not null unique,
  status      text not null default 'unknown',
  last_seen   timestamptz,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create sequence if not exists public.forecast_number_seq start 1;

create table if not exists public.forecasts (
  id                 uuid primary key default gen_random_uuid(),
  number             integer not null unique default nextval('public.forecast_number_seq'),
  question           text not null check (char_length(question) between 8 and 280),
  category           text not null default 'GENERAL'
                     check (category in ('CRYPTO','MARKETS','ONCHAIN','TECHNOLOGY','GENERAL')),
  source             text not null default 'PUBLIC RECORD',
  resolution_method  text not null default 'KEEPER REVIEW',
  deadline           timestamptz not null,
  status             text not null default 'OPEN'
                     check (status in ('DRAFT','OPEN','CLOSED','RESOLVED','VOID')),
  -- pipeline (IMD paid jobs)
  oracle_question     text,                 -- past tense question sent to the IMD oracle at resolution
  resolution_criteria text,
  generated_by        text not null default 'operator',   -- 'openai:<model>' | 'operator'
  pipeline_state      text not null default 'queued'
                      check (pipeline_state in ('draft','queued','forecasting','collected','resolving','resolved','void','failed')),
  forecast_job_id     text,
  oracle_request_id   text,
  -- Snowmoon ch.27 scenario questions: same outcome under 2 or 3 plans (null = plain question)
  scenarios           jsonb,                -- ["label A","label B",...]
  condition_question  text,                 -- oracle question returning which plan happened (1..n, 0 = none)
  condition_request_id text,
  attempts            integer not null default 0,
  last_error          text,
  updated_at          timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists forecasts_pipeline_idx on public.forecasts (pipeline_state, deadline);

create table if not exists public.predictions (
  id              uuid primary key default gen_random_uuid(),
  forecast_id     uuid not null references public.forecasts(id) on delete cascade,
  agent_token_id  text not null,
  p_yes           numeric(5,4) not null check (p_yes >= 0 and p_yes <= 1),
  rationale       text,
  source          text not null default 'imd-job',   -- where the probability came from
  job_id          text,                              -- IMD job that produced it
  raw             jsonb,
  submitted_at    timestamptz not null default now(),
  scenario        smallint not null default 0,       -- 0 plain question, 1..3 = plan A..C
  unique (forecast_id, agent_token_id, scenario)
);
create index if not exists predictions_agent_idx on public.predictions (agent_token_id);

-- One resolution per forecast. Evidence is required.
create table if not exists public.forecast_resolutions (
  forecast_id     uuid primary key references public.forecasts(id) on delete cascade,
  result          text not null check (result in ('YES','NO')),
  evidence_label  text not null,
  evidence_url    text,
  evidence_note   text,
  verified        boolean not null default false,
  scenario        smallint,             -- plan that actually happened (scenario questions only)
  resolved_by     text,                 -- KEEPER identifier
  resolved_at     timestamptz not null default now()
);

-- Predictions can only be submitted before the deadline and while OPEN
create or replace function public.guard_prediction() returns trigger as $$
declare f record;
begin
  select status, deadline into f from public.forecasts where id = new.forecast_id;
  -- judged by when the agent produced it, not when we stored it
  if f.status not in ('OPEN','CLOSED') or new.submitted_at > f.deadline then
    raise exception 'forecast is not accepting predictions';
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists predictions_guard on public.predictions;
create trigger predictions_guard before insert on public.predictions
  for each row execute function public.guard_prediction();

-- Resolving marks the forecast RESOLVED
create or replace function public.mark_resolved() returns trigger as $$
begin
  update public.forecasts set status = 'RESOLVED' where id = new.forecast_id;
  return new;
end $$ language plpgsql;

drop trigger if exists resolutions_mark on public.forecast_resolutions;
create trigger resolutions_mark after insert on public.forecast_resolutions
  for each row execute function public.mark_resolved();

-- Materialized scores (optional cache; the app computes the same values from predictions)
create table if not exists public.agent_scores (
  agent_token_id  text primary key,
  forecasts       integer not null default 0,
  resolved        integer not null default 0,
  correct         integer not null default 0,
  accuracy        numeric(6,5),
  brier           numeric(6,5),
  score           numeric(6,3),
  updated_at      timestamptz not null default now()
);

create or replace view public.agent_scores_live as
select
  p.agent_token_id,
  count(*)                                                        as forecasts,
  count(r.forecast_id)                                            as resolved,
  count(*) filter (where r.result = case when p.p_yes >= 0.5 then 'YES' else 'NO' end) as correct,
  avg(power(p.p_yes - case when r.result = 'YES' then 1 else 0 end, 2))
    filter (where r.forecast_id is not null)                      as brier
from public.predictions p
left join public.forecast_resolutions r
  on r.forecast_id = p.forecast_id
 and (r.scenario is null or r.scenario = p.scenario)   -- only the plan that happened is scored
group by p.agent_token_id;

create table if not exists public.oracle_queries (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  selected    text[] not null default '{}',
  basis       text,
  simulated   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.oracle_responses (
  id               uuid primary key default gen_random_uuid(),
  query_id         uuid not null references public.oracle_queries(id) on delete cascade,
  agent_token_id   text not null,
  p_yes            numeric(5,4) check (p_yes >= 0 and p_yes <= 1),
  rationale        text,
  created_at       timestamptz not null default now()
);

-- Every paid IMD action (0.5 IMD each). Also the source of the daily budget.
create table if not exists public.imd_orders (
  id                 uuid primary key default gen_random_uuid(),
  request_key        uuid not null unique,
  action             text not null,          -- job.open | oracle.request
  purpose            text not null,          -- forecast | resolution | condition
  forecast_id        uuid references public.forecasts(id) on delete set null,
  order_id           text,
  status             text not null default 'quoting',
                     -- quoting | quoted | submitted | admitted | payment_failed | expired | failed
  amount_wei         numeric,
  job_id             text,
  oracle_request_id  text,
  tx_hash            text,
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists imd_orders_day_idx on public.imd_orders (created_at);

create table if not exists public.settings (
  key    text primary key,
  value  jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value) values ('paused', 'false'::jsonb) on conflict do nothing;

create table if not exists public.system_events (
  id          bigserial primary key,
  kind        text not null,
  ref         text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- RLS: public read, writes only through the service role ----------
alter table public.agents               enable row level security;
alter table public.forecasts            enable row level security;
alter table public.predictions          enable row level security;
alter table public.forecast_resolutions enable row level security;
alter table public.agent_scores         enable row level security;
alter table public.oracle_queries       enable row level security;
alter table public.oracle_responses     enable row level security;
alter table public.system_events        enable row level security;
alter table public.imd_orders           enable row level security;   -- service role only
alter table public.settings             enable row level security;   -- service role only

do $$
declare t text;
begin
  foreach t in array array['agents','forecasts','predictions','forecast_resolutions','agent_scores','system_events']
  loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

-- Realtime for the live board
alter publication supabase_realtime add table public.predictions;
alter publication supabase_realtime add table public.forecast_resolutions;
