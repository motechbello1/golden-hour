import { supabase } from "./supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function authedFetch(path, options = {}, retries = 2) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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
    } catch (err) {
      if (attempt < retries && (err.message === "Failed to fetch" || err.message.includes("NetworkError"))) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

export const api = {
  startExam: (examId) =>
    authedFetch("/exams/start", { method: "POST", body: JSON.stringify({ exam_id: examId }) }),
  submitAnswer: (payload) =>
    authedFetch("/exams/answer", { method: "POST", body: JSON.stringify(payload) }, 3),
  getResult: (sessionId) =>
    authedFetch(`/exams/sessions/${sessionId}/result`),
};

export function proctorSocketUrl(sessionId) {
  return `${API_BASE.replace(/^http/, "ws")}/ws/proctor/${sessionId}`;
}
