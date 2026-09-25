import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/guards";
import { toPublicUser } from "@/lib/auth/session";
import { VoltarAoTopo } from "@/components/voltar-ao-topo";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <Suspense fallback={null}>
      <AppShell user={toPublicUser(user)}>
        {children}
        <VoltarAoTopo />
      </AppShell>
    </Suspense>
  );
}
