import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

// Pages (lazy-loaded for performance)
const Login = React.lazy(() => import('@/pages/Login'));
const OTP = React.lazy(() => import('@/pages/OTP'));
const SetupProfile = React.lazy(() => import('@/pages/SetName'));
const Groups = React.lazy(() => import('@/pages/Groups'));
const GroupDetail = React.lazy(() => import('@/pages/GroupDetail'));
const CreateGroup = React.lazy(() => import('@/pages/CreateGroup'));
const AddExpense = React.lazy(() => import('@/pages/AddExpense'));
const Analytics = React.lazy(() => import('@/pages/Analytics'));
const Profile = React.lazy(() => import('@/pages/Profile'));
const Friends = React.lazy(() => import('@/pages/Friends'));
const Invite = React.lazy(() => import('@/pages/Invite'));
const ForgotPassword = React.lazy(() => import('@/pages/ForgotPassword'));

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Catches render errors and shows a message instead of a blank screen. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 gap-4 text-center">
          <span className="text-5xl">⚠️</span>
          <h2 className="text-xl font-bold text-gray-900">Something went wrong</h2>
          <p className="text-gray-500 text-sm max-w-xs">
            {(this.state.error as Error).message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
            className="mt-2 px-6 py-2 bg-primary text-white rounded-xl text-sm font-semibold">
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Redirects unauthenticated users to /login, users without profile to /setup. */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();
  const location = useLocation();

  if (status === 'unknown') return <Spinner />;

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === 'needs-setup') {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}

/** Redirects already-authenticated users away from auth pages. */
function GuestGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();

  if (status === 'unknown') return <Spinner />;

  if (status === 'authenticated') return <Navigate to="/" replace />;
  if (status === 'needs-setup') return <Navigate to="/setup" replace />;

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
      reset();
    } else if (user) {
      setStatus(user.phone ? 'authenticated' : 'needs-setup');
    } else {
      reset();
    }
  }, []);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthInitializer />
        <React.Suspense fallback={<Spinner />}>
          <Routes>
            {/* Public auth routes */}
            <Route path="/login" element={<GuestGuard><Login /></GuestGuard>} />
            <Route path="/otp" element={<GuestGuard><OTP /></GuestGuard>} />
            <Route path="/forgot-password" element={<GuestGuard><ForgotPassword /></GuestGuard>} />
            {/* Setup is accessible whenever — AuthGuard redirects needs-setup users here */}
            <Route path="/setup" element={<SetupProfile />} />

            {/* Public invite route (auth handled inside Invite page) */}
            <Route path="/invite/:token" element={<Invite />} />

            {/* Protected app routes */}
            <Route path="/" element={<AuthGuard><Groups /></AuthGuard>} />
            <Route path="/group/new" element={<AuthGuard><CreateGroup /></AuthGuard>} />
            <Route path="/group/:id" element={<AuthGuard><GroupDetail /></AuthGuard>} />
            <Route path="/group/:id/add-expense" element={<AuthGuard><AddExpense /></AuthGuard>} />
            <Route path="/friends" element={<AuthGuard><Friends /></AuthGuard>} />
            <Route path="/analytics" element={<AuthGuard><Analytics /></AuthGuard>} />
            <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
