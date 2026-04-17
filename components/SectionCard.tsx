import * as React from "react";

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
};

export default function SectionCard({
  title,
  subtitle,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ${className}`}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title ? (
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          ) : null}

          {subtitle ? (
            <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
          ) : null}
        </div>
      )}

      {children}
    </section>
  );
}