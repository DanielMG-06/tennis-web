import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export default function Input({
  label,
  error,
  className = "",
  ...props
}: InputProps) {
  return (
    <div className="space-y-2">
      {label ? (
        <label
          htmlFor={props.id ?? props.name}
          className="block text-sm font-semibold text-slate-700"
        >
          {label}
        </label>
      ) : null}

      <input
        {...props}
        id={props.id ?? props.name}
        className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-200 ${className}`}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}