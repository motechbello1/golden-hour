# Deploying Golden Hour

Same shape as the SmartHire AI deploy: Supabase for data/auth, Render for
the FastAPI backend, Vercel for the React frontend. About 15 minutes if
you've done this pattern before, longer the first time mostly waiting on
Render's free-tier cold build.

## 1. Supabase (5 min)

1. Create a new project at supabase.com.
2. Open the SQL editor, paste in `supabase/schema.sql`, run it. This
   creates every table, the RLS policies, and seeds the two tracks
   (`ai-ml`, `full-stack`).
3. Go to Storage → create a new **private** bucket named
   `proctor-snapshots`. This is where flagged webcam frames get stored
   for instructor review — nothing is uploaded unless a flag fires.
4. Go to Authentication → Providers, make sure Email is enabled. For a
   fast cohort rollout, you can also turn off "Confirm email" under
   Authentication → Settings so students can register and go straight
   in without checking inbox/spam.
5. Grab three values from Project Settings → API: the Project URL, the
   `anon` public key, and the `service_role` key (keep that one secret —
   it only ever goes in the backend's env, never the frontend).

## 2. Backend on Render (5 min)

1. Push the `backend/` folder to a GitHub repo (or push the whole
   `golden-hour` repo — Render lets you set the root directory).
2. On render.com: New → Web Service → connect the repo.
3. Root directory: `backend` (if you pushed the monorepo).
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Environment variables (copy from `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALLOWED_ORIGINS` — set this once you know your Vercel URL, e.g.
     `https://golden-hour.vercel.app` (comma-separate if you need more
     than one, e.g. also `http://localhost:5173` while testing)
   - `RECONNECT_GRACE_SECONDS` — `90` is a sane default
   - `ANTHROPIC_API_KEY` — optional, only needed if you want the
     question-paraphrasing feature; leave blank otherwise
7. Deploy. Render gives you a URL like
   `https://golden-hour-backend.onrender.com` — that's your
   `VITE_API_BASE_URL` for the frontend.
8. Pick a paid instance type before the real exam, not the free tier —
   free instances spin down when idle and take ~30s to wake up, which
   would eat into a 7-second question timer for whoever happens to be
   the first hit after a cold start.

## 3. Load the question bank (2 min)

From your local machine, with the backend's `.env` filled in:

```
cd backend
pip install -r requirements.txt
python seed_questions.py ai-ml data/questions_ai_ml.json
python publish_exam.py
```

This inserts the 42 AI/ML questions and publishes the first exam
(20 objective + 5 code questions per student, drawn and shuffled
per-student from that pool). Re-run `publish_exam.py` with different
numbers if you want a longer or shorter paper — edit the script's
`objective_count`/`code_count` first.

## 4. Frontend on Vercel (5 min)

1. New Project on vercel.com, import the repo, set root directory to
   `frontend` if it's a monorepo.
2. Framework preset: Vite.
3. Environment variables (from `.env.example`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE_URL` — your Render backend URL from step 2
4. Deploy. Then go back to Render and set `ALLOWED_ORIGINS` to the real
   Vercel URL it just gave you, and redeploy the backend so CORS lines up.

## 5. Try it end to end

1. Visit your Vercel URL → Register → pick "AI & Machine Learning."
2. You'll land on the track page with one published exam — click it.
3. Camera check, then "Begin exam." Try switching tabs once on purpose:
   it should auto-submit instantly and drop you on the results page.
4. Open `/admin` in another tab/browser to watch the live event feed
   while a second student (or you, in incognito) takes the exam.

## What's deliberately not in today's build

- **True OS-level lockdown.** No website can block Alt+Tab or Win+D —
  that's outside the browser sandbox by design. What's built instead
  detects the *effect* of leaving (tab blur, fullscreen exit) and
  auto-submits instantly regardless of how the student tried to leave.
  A genuine OS-level kiosk lock would mean wrapping this same frontend
  in an Electron app — doable later, not a today task.
- **Admin role-based auth.** `/admin` is gated by a shared key typed
  once into the browser, not a real Supabase role check. Fine for you
  monitoring 15–20 students; replace with a proper `role = 'instructor'`
  check before opening it to other staff or scaling up.
- **Full-stack track question bank.** Only AI/ML has questions seeded.
  Same `questions_ai_ml.json` format works for a Full Stack file —
  write the questions, run `seed_questions.py full-stack <file>.json`,
  publish an exam against that track.
- **Load testing at 500 concurrent.** The architecture (seeded
  per-student papers, client-side webcam inference, lightweight
  WebSocket heartbeats) is built to scale that way without redesign,
  but it hasn't actually been run at that volume yet. Render/Supabase
  instance sizing will need bumping up from whatever you start on.
