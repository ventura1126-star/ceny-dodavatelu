"use client";

/**
 * Záchranná obrazovka pro neočekávané chyby.
 * Bez ní Next.js ukáže jen bílou stránku s "Application error".
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-rose-200 bg-rose-50 p-6">
      <h1 className="text-lg font-semibold text-rose-900">Něco se pokazilo</h1>
      <p className="mt-2 text-sm text-rose-800">
        Stránku se nepodařilo zobrazit. Vaše data v databázi to nijak neovlivnilo.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-800"
        >
          Zkusit znovu
        </button>
        <a
          href="/"
          className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-100"
        >
          Zpět na přehled
        </a>
      </div>
      {error.digest ? (
        <p className="mt-4 text-xs text-rose-700">
          Kód chyby pro dohledání v logu: <code>{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
