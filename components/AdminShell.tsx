import * as React from "react";
import Link from "next/link";

type AdminShellProps = {
  children: React.ReactNode;
};

export default function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-6 py-5">
          <h1 className="text-lg font-semibold text-slate-900">Tennis Admin</h1>
          <p className="text-sm text-slate-500">Panel de torneos</p>
        </div>

        <nav className="flex flex-col gap-2 p-4">
          <Link
            href="/dashboard"
            className="rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Dashboard
          </Link>
          <Link
            href="/tournaments"
            className="rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Torneos
          </Link>
          <Link
            href="/tournaments/new"
            className="rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Nuevo torneo
          </Link>
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Administración
          </h2>
        </header>

        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}