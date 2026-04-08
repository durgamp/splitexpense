'use client';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, prefix, suffix, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-gray-600">{label}</label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-gray-400 text-sm select-none pointer-events-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500
              ${error ? 'border-red-400' : 'border-gray-200'}
              ${prefix ? 'pl-7' : ''}
              ${suffix ? 'pr-7' : ''}
              ${className}`}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-gray-400 text-sm select-none pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
