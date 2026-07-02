import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import AuthPage    from './pages/AuthPage.jsx';
import Dashboard   from './pages/Dashboard.jsx';
import ProjectPage from './pages/ProjectPage.jsx';

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{color:'#fff',padding:40}}>Loading…</div>;
  return user ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"            element={<AuthPage />} />
        <Route path="/dashboard"   element={<Guard><Dashboard /></Guard>} />
        <Route path="/project/:id" element={<Guard><ProjectPage /></Guard>} />
      </Routes>
    </BrowserRouter>
  );
}
