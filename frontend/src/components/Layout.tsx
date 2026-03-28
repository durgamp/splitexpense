import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Groups', icon: '👥' },
  { to: '/analytics', label: 'Analytics', icon: '📊' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      <main className="flex-1 pb-20">{children}</main>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg border-t border-gray-200 bg-white flex">
        {NAV.map(({ to, label, icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${active ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <span className="text-xl mb-0.5">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
