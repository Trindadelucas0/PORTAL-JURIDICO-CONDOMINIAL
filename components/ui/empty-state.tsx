import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Empty className="border-0 bg-transparent py-10">
      <EmptyHeader>
        <EmptyTitle className="text-sm font-medium text-muted-foreground">{title || "Tudo limpo"}</EmptyTitle>
        {hint ? <EmptyDescription>{hint}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? (
        <EmptyContent>
          <Button type="button" variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
