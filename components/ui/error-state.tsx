import { Button } from "@/components/ui/button";

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--danger)]/25 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"
    >
      <span>{message}</span>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function ForbiddenState({ message = "Sem permissão para esta área." }: { message?: string }) {
  return (
    <div className="px-4 py-12">
      <h1 className="text-xl font-semibold">Acesso restrito</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}
