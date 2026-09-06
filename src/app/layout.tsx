import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ceník dodavatelů — Mistři dřeva",
  description: "Databáze nákupních cen materiálu z faktur dodavatelů.",
};

const NAV = [
  { href: "/", label: "Přehled" },
  { href: "/nahrat", label: "Nahrát faktury" },
  { href: "/faktury", label: "Faktury" },
  { href: "/materialy", label: "Materiály a ceny" },
  { href: "/dodavatele", label: "Dodavatelé" },
  { href: "/kalkulace", label: "Kalkulace" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen antialiased">
        <header className="bg-bark-800 text-bark-100">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight text-white">
              Mistři dřeva <span className="font-normal text-bark-300">· ceny materiálu</span>
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 transition hover:bg-bark-700 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
