# Golden Hour

A proctored online exam platform for ICBM Bootcamp assessments.

**Stack:** Supabase (auth, Postgres, storage) · FastAPI on Render
(exam engine, WebSocket heartbeat, lockdown logic) · React/Vite on
Vercel (exam UI, client-side webcam proctoring via face-api.js).

## What it does

- Students register with their name and track, get a unique code
  (`ICBM-C2-####`) that seeds their personal exam paper.
- Each student gets a different, deterministically-seeded subset of
  the question bank in a different order, with options shuffled —
  same student reconnecting always gets their exact paper back,
  different students get genuinely different papers.
- Objective questions: 7 seconds each. Code questions: 12 seconds
  each. No going back. Timer expiry auto-advances on whatever's
  currently selected (or nothing).
- Runs in enforced fullscreen. Leaving the tab, exiting fullscreen, or
  trying to open devtools auto-submits the exam immediately.
- Webcam stays on the whole time, running face-detection entirely in
  the browser (no continuous video sent anywhere) — flags no-face,
  multiple-faces, and looking-away patterns for instructor review.
- A real network drop is treated differently from a deliberate exit:
  a 90-second grace window lets a student resume exactly where they
  left off if their connection or PC dies.
- Score is calculated and shown the instant the last question is
  answered.
- `/admin` gives a live view of every active session and every
  violation/flag as it happens.

## Repo layout

```
backend/    FastAPI app — exam logic, WebSocket proctoring, scoring
frontend/   React/Vite app — registration, the exam itself, results, admin view
supabase/   schema.sql — run this once in a new Supabase project
DEPLOY.md   step-by-step guide to get this live
```

See `DEPLOY.md` to actually stand it up.
