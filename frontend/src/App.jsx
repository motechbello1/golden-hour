import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import TrackSelect from "./pages/TrackSelect.jsx";
import Exam from "./pages/Exam.jsx";
import Results from "./pages/Results.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/track" element={<TrackSelect />} />
      <Route path="/exam/:examId" element={<Exam />} />
      <Route path="/results/:sessionId" element={<Results />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
