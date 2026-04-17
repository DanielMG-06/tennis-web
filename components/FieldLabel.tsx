import * as React from "react";

type FieldLabelProps = {
  children: React.ReactNode;
};

export default function FieldLabel({ children }: FieldLabelProps) {
  return (
    <label className="mb-2 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}