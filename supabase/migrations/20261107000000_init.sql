-- Udyam Digital — initial schema. Run once in the Supabase SQL editor (or `supabase db push`).
-- Access model: the browser never talks to these tables. Every read/write goes through the API using the
-- service-role key. RLS is enabled with NO policies, so the publishable/anon key can read nothing.

-- ---------------------------------------------------------------- reference data (SIMULATED registries)
create table if not exists public.registry_gstin (
  gstin                       text primary key check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  legal_name                  text not null,
  trade_name                  text not null,
  constitution                text not null,
  principal_place_of_business text not null,
  state                       text not null,
  registration_date           date not null,
  status                      text not null check (status in ('Active', 'Cancelled', 'Suspended'))
);

create table if not exists public.registry_udyam (
  udyam_number         text primary key check (udyam_number ~ '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$'),
  enterprise_name      text not null,
  enterprise_type      text not null,
  major_activity       text not null,
  nic_description      text not null,
  state                text not null,
  city                 text not null,
  date_of_registration date not null
);

-- Synthetic lead history used by the back-office "leads not closed" view.
create table if not exists public.leads (
  lead_id text primary key,
  data    jsonb not null
);

-- OCR results for the 47 synthetic specimen images, so the hosted app works without the local OCR service.
create table if not exists public.ocr_specimen_cache (
  sha256    text primary key,
  specimen  text not null,
  doc_type  text not null,
  fields    jsonb not null,
  sharpness numeric not null,
  skew      numeric not null
);

-- ---------------------------------------------------------------- application data
create table if not exists public.app_sessions (
  id         uuid primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.business_profiles (
  session_id uuid primary key references public.app_sessions(id) on delete cascade,
  gst_status text not null check (gst_status in ('Active', 'Cancelled', 'Suspended', 'No GSTIN', 'NotFound', 'Unchecked')),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.advisor_runs (
  session_id uuid primary key references public.app_sessions(id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id          uuid primary key,
  session_id  uuid not null references public.app_sessions(id) on delete cascade,
  status      text not null check (status in ('draft', 'accepted', 'invalidated')),
  data        jsonb not null,
  valid_until timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists quotes_session_idx on public.quotes (session_id);

create table if not exists public.consent_records (
  id             uuid primary key,
  session_id     uuid not null references public.app_sessions(id) on delete cascade,
  purpose        text not null check (purpose in ('registry_lookup', 'kyc_verification', 'order_communication')),
  notice_version text not null,
  lang           text not null check (lang in ('en', 'hi')),
  granted_at     timestamptz not null default now(),
  withdrawn_at   timestamptz,
  check (withdrawn_at is null or withdrawn_at >= granted_at)
);
create index if not exists consent_session_idx on public.consent_records (session_id) where withdrawn_at is null;

create table if not exists public.kyc_documents (
  id              uuid primary key,
  session_id      uuid not null references public.app_sessions(id) on delete cascade,
  doc_type        text not null check (doc_type in ('gst_certificate', 'udyam_certificate', 'signatory_id', 'address_proof')),
  sha256          text not null,
  size_bytes      int not null check (size_bytes > 0 and size_bytes <= 4194304),
  mime_type       text not null check (mime_type in ('image/png', 'image/jpeg', 'application/pdf')),
  sharpness       numeric,
  skew            numeric,
  fields          jsonb not null,            -- only the fields our checks use; ID numbers masked
  source          text not null check (source in ('ocr_service', 'cached_specimen', 'unrecognised')),
  storage_path    text,                      -- private bucket object, deleted at retention_until
  uploaded_at     timestamptz not null default now(),
  retention_until timestamptz not null,
  unique (session_id, doc_type)              -- a re-upload replaces the previous document
);

create table if not exists public.kyc_cases (
  id            uuid primary key,
  session_id    uuid not null references public.app_sessions(id) on delete cascade,
  verdict       text not null check (verdict in ('PASS', 'NEEDS_ACTION', 'REVIEW', 'REJECT')),
  decided_by    text not null check (decided_by in ('engine', 'reviewer')),
  reviewer_note text,
  result        jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists kyc_cases_session_idx on public.kyc_cases (session_id, created_at desc);
create index if not exists kyc_cases_verdict_idx on public.kyc_cases (verdict);

create table if not exists public.orders (
  id          uuid primary key,
  session_id  uuid not null references public.app_sessions(id) on delete cascade,
  quote_id    uuid not null unique references public.quotes(id),
  kyc_case_id uuid not null references public.kyc_cases(id),
  status      text not null check (status in ('placed', 'kyc_verified', 'installation_scheduled', 'installed', 'activated', 'on_hold', 'cancelled')),
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists orders_session_idx on public.orders (session_id);

-- ---------------------------------------------------------------- lock everything down
do $$
declare t text;
begin
  foreach t in array array['registry_gstin', 'registry_udyam', 'leads', 'ocr_specimen_cache', 'app_sessions', 'business_profiles',
                           'advisor_runs', 'quotes', 'consent_records', 'kyc_documents', 'kyc_cases', 'orders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- private storage for KYC images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-private', 'kyc-private', false, 4194304, array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do nothing;
-- No storage policies are created: only the service role can read/write; reviewers get 60-second signed URLs.
