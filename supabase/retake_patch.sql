-- Run this in Supabase SQL Editor after the original schema.sql

-- 1. Add 'reset' status to exam_sessions so admin-approved retakes
--    preserve the old session for audit without blocking a new attempt.
alter table exam_sessions
  drop constraint exam_sessions_status_check;

alter table exam_sessions
  add constraint exam_sessions_status_check
  check (status in ('in_progress','disconnected','submitted','auto_submitted','expired','reset'));

-- 2. Retake requests table
create table if not exists retake_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  exam_id uuid references exams(id) not null,
  session_id uuid references exam_sessions(id) not null,
  reason text default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

alter table retake_requests enable row level security;

create policy "students can request own retake" on retake_requests
  for insert with check (auth.uid() = student_id);

create policy "students can view own retake requests" on retake_requests
  for select using (auth.uid() = student_id);

-- 3. Update exam timing (run this to apply 15s per question)
update exams set
  objective_time_seconds = 15,
  code_time_seconds = 15,
  objective_count = 25,
  code_count = 0;
