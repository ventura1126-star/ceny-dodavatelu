"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { deleteSupplierContact, saveSupplierContact, type ContactInput } from "@/lib/actions";
import type { SupplierContact } from "@/lib/types";

const EMPTY: ContactInput = { id: null, firstName: "", lastName: "", phone: "", email: "", scope: "" };

export default function SupplierContacts({
  supplierId,
  contacts,
}: {
  supplierId: number;
  contacts: SupplierContact[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<ContactInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function edit(contact: SupplierContact) {
    setError(null);
    setForm({
      id: contact.id,
      firstName: contact.first_name ?? "",
      lastName: contact.last_name ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      scope: contact.scope ?? "",
    });
  }

  function save() {
    if (!form) return;
    startTransition(async () => {
      const result = await saveSupplierContact(supplierId, form);
      if (!result.ok) {
        setError(result.error ?? "Uložení se nepovedlo.");
        return;
      }
      setForm(null);
      setError(null);
      router.refresh();
    });
  }

  function remove(contactId: number) {
    if (!confirm("Opravdu smazat tenhle kontakt?")) return;
    startTransition(async () => {
      await deleteSupplierContact(supplierId, contactId);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-bark-600">
          Kontakty
        </h2>
        {form === null ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setForm({ ...EMPTY });
            }}
            className="rounded-lg border border-bark-300 bg-white px-3 py-1.5 text-sm font-medium text-bark-800 transition hover:bg-bark-100"
          >
            Přidat kontakt
          </button>
        ) : null}
      </div>

      {form !== null ? (
        <Card className="mb-3 max-w-3xl">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Jméno">
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="input"
                autoFocus
              />
            </Field>
            <Field label="Příjmení">
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Telefon">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+420 739 005 615"
                className="input"
              />
            </Field>
            <Field label="E-mail">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jmeno@dodavatel.cz"
                className="input"
              />
            </Field>
            <Field label="Jaké materiály řeší" className="sm:col-span-2">
              <input
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                placeholder="řezivo, fasádní profily"
                className="input"
              />
            </Field>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800 disabled:opacity-50"
            >
              {pending ? "Ukládám…" : form.id ? "Uložit změny" : "Přidat"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setError(null);
              }}
              className="text-sm text-bark-600 underline hover:text-bark-900"
            >
              Zrušit
            </button>
            {error ? <span className="text-sm text-rose-700">{error}</span> : null}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Jméno</th>
              <th>Telefon</th>
              <th>E-mail</th>
              <th>Jaké materiály řeší</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td>
                  {c.phone ? (
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="hover:underline">
                      {c.phone}
                    </a>
                  ) : (
                    <span className="text-bark-400">—</span>
                  )}
                </td>
                <td>
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="hover:underline">
                      {c.email}
                    </a>
                  ) : (
                    <span className="text-bark-400">—</span>
                  )}
                </td>
                <td className="text-bark-700">{c.scope ?? <span className="text-bark-400">—</span>}</td>
                <td className="whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => edit(c)}
                    className="text-xs text-bark-600 underline hover:text-bark-900"
                  >
                    upravit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(c.id)}
                    className="ml-3 text-xs text-rose-600 underline hover:text-rose-800"
                  >
                    smazat
                  </button>
                </td>
              </tr>
            ))}
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-bark-600">
                  Zatím tu není žádný kontakt. Přidejte obchodního zástupce, ať ho nemusíte
                  hledat v mailech.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-bark-600">
        {label}
      </span>
      {children}
    </label>
  );
}
