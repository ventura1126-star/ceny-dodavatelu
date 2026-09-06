import Link from "next/link";
import type { ReactNode } from "react";

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-bark-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-bark-600">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-bark-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-bark-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-bark-900">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-bark-500">{hint}</div> : null}
    </Card>
  );
}

export function Empty({ title, hint, cta }: { title: string; hint?: string; cta?: { href: string; label: string } }) {
  return (
    <Card className="p-10 text-center">
      <p className="font-medium text-bark-800">{title}</p>
      {hint ? <p className="mt-1 text-sm text-bark-600">{hint}</p> : null}
      {cta ? (
        <Link
          href={cta.href}
          className="mt-4 inline-block rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800"
        >
          {cta.label}
        </Link>
      ) : null}
    </Card>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "bg-bark-100 text-bark-700",
    good: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-800",
    bad: "bg-rose-100 text-rose-800",
  } as const;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
