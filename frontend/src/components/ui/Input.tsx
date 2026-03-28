import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  prefix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, prefix, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-600">{label}</label>}
      <div className={`flex items-center border-2 rounded-xl bg-white px-3 transition-colors ${error ? 'border-red-400' : 'border-gray-200 focus-within:border-primary'}`}>
        {prefix && <span className="text-gray-400 mr-1 shrink-0">{prefix}</span>}
        <input
          ref={ref}
          className={`flex-1 py-2.5 text-gray-900 placeholder-gray-400 bg-transparent outline-none text-base ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
);
Input.displayName = 'Input';
