import { supabase } from "./supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function authedFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  startExam: (examId) =>
    authedFetch("/exams/start", { method: "POST", body: JSON.stringify({ exam_id: examId }) }),

  submitAnswer: (payload) =>
    authedFetch("/exams/answer", { method: "POST", body: JSON.stringify(payload) }),

  getResult: (sessionId) => authedFetch(`/exams/sessions/${sessionId}/result`),
};

export function proctorSocketUrl(sessionId) {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/ws/proctor/${sessionId}`;
}
