import * as React from "react";

type PageIntroProps = {
  title: string;
  subtitle?: string;
};

export default function PageIntro({ title, subtitle }: PageIntroProps) {
  return (
    <div className="mb-6 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
        {title}
      </h1>

      {subtitle ? (
        <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
      ) : null}
    </div>
  );
}