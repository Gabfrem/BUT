-- ============================================================================
--  Carnet — schéma Supabase
--  À coller dans : Supabase Dashboard > SQL Editor > New query > Run
--  Ré-exécutable sans casse.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- MATIÈRES --
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code        text,                                   -- 'R1.01', 'SAÉ 1.02'…
  name        text not null,                          -- 'Initiation au développement'
  color       text not null default '#6366f1',
  semester    text,                                   -- 'S1' | 'S2' | null
  kind        text not null default 'ressource'
              check (kind in ('ressource','sae','autre')),
  position    int  not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists subjects_user_idx on public.subjects (user_id, archived, position);

-- --------------------------------------------------------------- CHAPITRES --
create table if not exists public.chapters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  name        text not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists chapters_subject_idx on public.chapters (subject_id, position);

-- --------------------------------------------------------------- FEUILLES --
-- Une "feuille" = un document scanné, composé de 1..n pages.
create table if not exists public.sheets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id  uuid references public.subjects(id) on delete set null,
  chapter_id  uuid references public.chapters(id) on delete set null,
  title       text,
  note        text,
  tags        text[] not null default '{}',
  taken_on    date not null default current_date,     -- date du cours
  starred     boolean not null default false,
  unfinished  boolean not null default false,         -- feuille commencée, à compléter
  ocr_text    text,                                   -- réservé (OCR éventuel plus tard)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Colonnes ajoutées après coup : « create table if not exists » ne les crée pas
-- sur une base déjà en place, d'où ces alter explicites.
alter table public.sheets add column if not exists unfinished boolean not null default false;
create index if not exists sheets_user_idx    on public.sheets (user_id, taken_on desc, created_at desc);
create index if not exists sheets_subject_idx on public.sheets (subject_id, taken_on desc);
create index if not exists sheets_chapter_idx on public.sheets (chapter_id, taken_on desc);
create index if not exists sheets_tags_idx    on public.sheets using gin (tags);

-- Recherche plein texte (prête pour un OCR éventuel).
-- Colonne alimentée par un trigger et non par une expression « generated » :
-- to_tsvector('french', …) et array_to_string ne sont pas immutables, ce que
-- Postgres exige pour une colonne générée (erreur 42P17).
alter table public.sheets add column if not exists search tsvector;
create index if not exists sheets_search_idx on public.sheets using gin (search);

create or replace function public.sheets_refresh_search() returns trigger
language plpgsql as $fn$
begin
  new.search := to_tsvector('french',
    coalesce(new.title,'')    || ' ' ||
    coalesce(new.note,'')     || ' ' ||
    coalesce(array_to_string(new.tags,' '),'') || ' ' ||
    coalesce(new.ocr_text,''));
  return new;
end
$fn$;

drop trigger if exists sheets_search on public.sheets;
create trigger sheets_search before insert or update on public.sheets
  for each row execute function public.sheets_refresh_search();

-- Remplit la colonne pour d'éventuelles lignes déjà présentes
-- (aucune au premier lancement : l'instruction ne fait alors rien).
update public.sheets set title = title where search is null;

-- ------------------------------------------------------------------ PAGES --
create table if not exists public.pages (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sheet_id      uuid not null references public.sheets(id) on delete cascade,
  position      int  not null default 0,
  storage_path  text not null,                        -- '<uid>/<sheet_id>/<n>.jpg'
  width         int,
  height        int,
  bytes         int,
  created_at    timestamptz not null default now()
);
create index if not exists pages_sheet_idx on public.pages (sheet_id, position);

-- --------------------------------------------------------------- RÉGLAGES --
create table if not exists public.settings (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  ics_url        text,
  ics_events     jsonb not null default '[]'::jsonb,  -- cache de l'emploi du temps
  ics_synced_at  timestamptz,
  updated_at     timestamptz not null default now()
);

-- ------------------------------------------------------ updated_at auto --
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $fn$
begin new.updated_at = now(); return new; end
$fn$;

drop trigger if exists sheets_touch on public.sheets;
create trigger sheets_touch before update on public.sheets
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ============================================================================
--  RLS — chacun ne voit que ses propres données
-- ============================================================================
alter table public.subjects enable row level security;
alter table public.chapters enable row level security;
alter table public.sheets   enable row level security;
alter table public.pages    enable row level security;
alter table public.settings enable row level security;

do $rls$
declare t text;
begin
  foreach t in array array['subjects','chapters','sheets','pages','settings'] loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);
    execute format('create policy "own_select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "own_insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "own_update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own_delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end
$rls$;

-- ============================================================================
--  VUES pratiques (security_invoker => la RLS des tables s'applique)
-- ============================================================================
create or replace view public.subject_overview
with (security_invoker = true) as
select
  s.*,
  (select count(*) from public.sheets   f where f.subject_id = s.id) as sheet_count,
  (select count(*) from public.chapters c where c.subject_id = s.id) as chapter_count,
  (select max(f.taken_on) from public.sheets f where f.subject_id = s.id) as last_sheet_on
from public.subjects s;

create or replace view public.chapter_overview
with (security_invoker = true) as
select
  c.*,
  (select count(*) from public.sheets f where f.chapter_id = c.id) as sheet_count,
  (select max(f.taken_on) from public.sheets f where f.chapter_id = c.id) as last_sheet_on
from public.chapters c;

create or replace view public.sheet_overview
with (security_invoker = true) as
select
  f.*,
  (select p.storage_path from public.pages p where p.sheet_id = f.id order by p.position limit 1) as cover_path,
  (select count(*) from public.pages p where p.sheet_id = f.id) as page_count,
  sub.name  as subject_name,
  sub.code  as subject_code,
  sub.color as subject_color,
  ch.name   as chapter_name
from public.sheets f
left join public.subjects sub on sub.id = f.subject_id
left join public.chapters ch  on ch.id  = f.chapter_id;

-- ============================================================================
--  DROITS
--  Supabase accorde déjà ces droits par défaut aux nouvelles tables du schéma
--  public ; on les redonne explicitement pour éviter un « permission denied »
--  si les privilèges par défaut du projet ont été modifiés. La RLS ci-dessus
--  reste seule maîtresse de ce que chacun peut réellement lire.
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.subjects, public.chapters, public.sheets, public.pages, public.settings
  to authenticated;

grant select on
  public.subject_overview, public.chapter_overview, public.sheet_overview
  to authenticated;

-- Retrouver vite les feuilles laissées en plan
create index if not exists sheets_unfinished_idx
  on public.sheets (user_id, unfinished) where unfinished;
