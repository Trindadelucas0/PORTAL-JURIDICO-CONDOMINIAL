"use client";

type CondoOption = { id: string; nome: string };

export function ContactCondominiumPicker({
  options,
  selectedIds,
  primaryId,
  onChange,
  loading,
  showPrimary = true,
  emptyHint = "Nenhum condomínio cadastrado.",
  hint = "A conversa do WhatsApp fica no condomínio marcado como principal. Chamados já abertos não mudam de lugar.",
}: {
  options: CondoOption[];
  selectedIds: string[];
  primaryId: string;
  onChange: (next: { selectedIds: string[]; primaryId: string }) => void;
  loading?: boolean;
  showPrimary?: boolean;
  emptyHint?: string;
  hint?: string;
}) {
  function toggle(id: string) {
    const checked = selectedIds.includes(id);
    if (checked) {
      const next = selectedIds.filter((x) => x !== id);
      onChange({
        selectedIds: next,
        primaryId: primaryId === id ? next[0] || "" : primaryId,
      });
      return;
    }
    onChange({
      selectedIds: [...selectedIds, id],
      primaryId: showPrimary ? primaryId || id : primaryId,
    });
  }

  function setPrimary(id: string) {
    if (!selectedIds.includes(id)) {
      onChange({ selectedIds: [...selectedIds, id], primaryId: id });
      return;
    }
    onChange({ selectedIds, primaryId: id });
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{showPrimary ? "Condomínios" : "Também nestes condomínios"}</p>
        <div className="h-20 animate-pulse rounded-[var(--radius)] bg-muted" />
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium">{showPrimary ? "Condomínios" : "Também nestes condomínios"}</p>
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{showPrimary ? "Condomínios" : "Também nestes condomínios"}</legend>
      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-[var(--radius)] border border-border p-2">
        {options.map((c) => {
          const checked = selectedIds.includes(c.id);
          const isPrimary = showPrimary && primaryId === c.id;
          return (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted/60">
                <input
                  type="checkbox"
                  className="size-4 shrink-0"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                />
                {showPrimary ? (
                  <input
                    type="radio"
                    name="contact-condo-primary"
                    className="size-4 shrink-0"
                    checked={isPrimary}
                    disabled={!checked && selectedIds.length > 0}
                    onChange={() => setPrimary(c.id)}
                    aria-label={`Principal: ${c.nome}`}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                {isPrimary && checked ? (
                  <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    principal
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      {showPrimary && selectedIds.length > 0 && !primaryId ? (
        <p className="text-xs text-[var(--danger)]">Escolha o condomínio principal.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </fieldset>
  );
}

/** Carrega todas as páginas de condomínios (pageSize máx. 50). */
export async function fetchAllCondominiums(
  apiFn: <T>(path: string) => Promise<{ data: T; meta?: { total?: number; page?: number; pageSize?: number } }>,
): Promise<CondoOption[]> {
  const pageSize = 50;
  const first = await apiFn<CondoOption[]>(`/api/condominiums?page=1&pageSize=${pageSize}`);
  const items = [...(first.data ?? [])];
  const total = first.meta?.total ?? items.length;
  let page = 1;
  while (items.length < total) {
    page += 1;
    const next = await apiFn<CondoOption[]>(`/api/condominiums?page=${page}&pageSize=${pageSize}`);
    const batch = next.data ?? [];
    if (!batch.length) break;
    items.push(...batch);
  }
  return items;
}
