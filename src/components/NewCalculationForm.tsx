"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCalculation } from "@/lib/actions";

export default function NewCalculationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Název zakázky"
        className="rounded-lg border border-bark-300 bg-white px-3 py-2 text-sm focus:border-bark-500 focus:outline-none"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const id = await createCalculation(name);
            router.push(`/kalkulace/${id}`);
          })
        }
        className="rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800 disabled:opacity-60"
      >
        Založit kalkulaci
      </button>
    </div>
  );
}
