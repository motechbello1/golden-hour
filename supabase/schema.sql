-- Golden Hour exam platform — Supabase schema
-- Run this in the Supabase SQL editor on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tracks (AI & ML, Full Stack, ...). Seed once, reuse across cohorts.
-- ---------------------------------------------------------------------
create table tracks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,           -- e.g. 'ai-ml'
  name text not null,                  -- e.g. 'AI & Machine Learning'
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Students. auth.users (Supabase Auth) holds the login credentials;
-- this table holds the registration data (track, unique code, cohort).
-- ---------------------------------------------------------------------
create table students (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  unique_code text unique not null,     -- e.g. ICBM-C2-0147, used as the per-student randomization seed
  track_id uuid references tracks(id) not null,
  cohort text default 'cohort-2',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Question bank. One row per question. `options` is null for code
-- questions that are free-text/typed-answer rather than multiple choice.
-- ---------------------------------------------------------------------
create table question_bank (
  id uuid primary key default gen_random_uuid(),
  track_id uuid references tracks(id) not null,
  type text not null check (type in ('objective', 'code')),  -- objective=7s, code=12s
  difficulty text default 'medium',
  prompt text not null,
  options jsonb,                 -- [{ "id": "a", "text": "..." }, ...] or null
  correct_option_id text,        -- for objective questions
  correct_answer text,           -- for code questions (exact/regex match, graded leniently)
  explanation text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Exams. A configured assessment drawn from a track's question_bank.
-- ---------------------------------------------------------------------
create table exams (
  id uuid primary key default gen_random_uuid(),
  track_id uuid references tracks(id) not null,
  title text not null,
  objective_count int not null default 20,
  code_count int not null default 5,
  objective_time_seconds int not null default 7,
  code_time_seconds int not null default 12,
  paraphrase boolean default false,     -- toggle LLM paraphrasing of question text/options
  is_published boolean default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Exam sessions — one per student attempt. `question_order` is the
-- deterministic, seeded list of question_bank IDs for this student,
-- generated once at start and never recomputed, so a reconnect resumes
-- the exact same paper rather than rerolling.
-- ---------------------------------------------------------------------
create table exam_sessions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) not null,
  student_id uuid references students(id) not null,
  question_order jsonb not null,        -- ordered array of question_bank ids
  option_shuffles jsonb not null,       -- { question_id: [shuffled option ids] }
  current_index int not null default 0,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'disconnected', 'submitted', 'auto_submitted', 'expired')),
  disconnected_at timestamptz,
  score numeric,
  max_score numeric,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  unique (exam_id, student_id)
);

-- ---------------------------------------------------------------------
-- Answers given per question in a session.
-- ---------------------------------------------------------------------
create table exam_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references exam_sessions(id) not null,
  question_id uuid references question_bank(id) not null,
  selected_option_id text,
  typed_answer text,
  is_correct boolean,
  time_taken_ms int,
  auto_advanced boolean default false,   -- true if the timer ran out rather than the student answering
  answered_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Proctor events — every lockdown violation and camera-AI flag, for
-- the admin live-monitoring view and post-exam review. Deliberately
-- append-only; nothing here triggers a penalty automatically except
-- the 'hard_violation' types, which the backend auto-submits on.
-- ---------------------------------------------------------------------
create table proctor_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references exam_sessions(id) not null,
  event_type text not null check (event_type in (
    'fullscreen_exit', 'tab_blur', 'devtools_attempt',     -- hard violations -> auto-submit
    'no_face', 'multiple_faces', 'looking_away', 'phone_detected', -- soft flags -> logged, reviewable
    'heartbeat_lost', 'heartbeat_resumed'                  -- connectivity, not punished
  )),
  severity text not null default 'soft' check (severity in ('soft', 'hard')),
  snapshot_url text,            -- optional, only for camera flags worth keeping evidence of
  meta jsonb,
  created_at timestamptz default now()
);

create index idx_exam_answers_session on exam_answers(session_id);
create index idx_proctor_events_session on proctor_events(session_id);
create index idx_exam_sessions_status on exam_sessions(status);

-- Row Level Security — students can only ever touch their own rows.
alter table students enable row level security;
alter table exam_sessions enable row level security;
alter table exam_answers enable row level security;
alter table proctor_events enable row level security;
alter table tracks enable row level security;
alter table exams enable row level security;
alter table question_bank enable row level security;  -- intentionally no policies: sealed off from the browser entirely

create policy "students see own row" on students
  for select using (auth.uid() = id);

create policy "students manage own sessions" on exam_sessions
  for all using (auth.uid() = student_id);

create policy "students manage own answers" on exam_answers
  for all using (
    session_id in (select id from exam_sessions where student_id = auth.uid())
  );

create policy "students write own proctor events" on proctor_events
  for insert with check (
    session_id in (select id from exam_sessions where student_id = auth.uid())
  );

-- tracks and exams hold no sensitive data (no answers), so a public
-- read policy is fine — it's what lets Register/TrackSelect query them
-- directly with the anon key. question_bank intentionally gets NO
-- policy at all: it's sealed off from the browser entirely, readable
-- only by the backend's service-role key, which bypasses RLS.
create policy "anyone can read tracks" on tracks
  for select using (true);

create policy "anyone can read published exams" on exams
  for select using (is_published = true);

-- Seed the two tracks you teach.
insert into tracks (slug, name) values
  ('ai-ml', 'AI & Machine Learning'),
  ('full-stack', 'Software Development (Full Stack)');
