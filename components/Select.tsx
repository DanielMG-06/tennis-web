import * as React from "react";

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  options: SelectOption[];
};

export default function Select({
  label,
  error,
  options,
  className = "",
  ...props
}: SelectProps) {
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

      <select
        {...props}
        id={props.id ?? props.name}
        className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-200 ${className}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}