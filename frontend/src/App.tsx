import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

// Pages (lazy-loaded for performance)
const Login = React.lazy(() => import('@/pages/Login'));
const OTP = React.lazy(() => import('@/pages/OTP'));
const SetName = React.lazy(() => import('@/pages/SetName'));
const Groups = React.lazy(() => import('@/pages/Groups'));
const GroupDetail = React.lazy(() => import('@/pages/GroupDetail'));
const CreateGroup = React.lazy(() => import('@/pages/CreateGroup'));
const AddExpense = React.lazy(() => import('@/pages/AddExpense'));
const Analytics = React.lazy(() => import('@/pages/Analytics'));
const Profile = React.lazy(() => import('@/pages/Profile'));
const Invite = React.lazy(() => import('@/pages/Invite'));

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Redirects unauthenticated users to /login, users without a name to /set-name. */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();
  const location = useLocation();

  if (status === 'unknown') return <Spinner />;

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === 'needs-name') {
    return <Navigate to="/set-name" replace />;
  }

  return <>{children}</>;
}

/** Redirects already-authenticated users away from auth pages. */
function GuestGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();

  if (status === 'unknown') return <Spinner />;

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/** On app mount, resolve 'unknown' status so guards never spin forever. */
function AuthInitializer() {
  const { status, user, reset, setStatus } = useAuthStore();

  useEffect(() => {
    if (status !== 'unknown') return;

    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!accessToken && !refreshToken) {
      // No tokens at all — definitely unauthenticated
      reset();
    } else if (user) {
      // Tokens + persisted user — restore status from user shape
      setStatus(user.name ? 'authenticated' : 'needs-name');
    } else {
      // Tokens exist but no persisted user — treat as unauthenticated;
      // the next protected API call will either succeed or trigger refresh/redirect
      reset();
    }
  }, []);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInitializer />
      <React.Suspense fallback={<Spinner />}>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<GuestGuard><Login /></GuestGuard>} />
          <Route path="/otp" element={<GuestGuard><OTP /></GuestGuard>} />
          <Route path="/set-name" element={<SetName />} />

          {/* Public invite route (auth handled inside Invite page) */}
          <Route path="/invite/:token" element={<Invite />} />

          {/* Protected app routes */}
          <Route path="/" element={<AuthGuard><Groups /></AuthGuard>} />
          <Route path="/group/new" element={<AuthGuard><CreateGroup /></AuthGuard>} />
          <Route path="/group/:id" element={<AuthGuard><GroupDetail /></AuthGuard>} />
          <Route path="/group/:id/add-expense" element={<AuthGuard><AddExpense /></AuthGuard>} />
          <Route path="/analytics" element={<AuthGuard><Analytics /></AuthGuard>} />
          <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
}
