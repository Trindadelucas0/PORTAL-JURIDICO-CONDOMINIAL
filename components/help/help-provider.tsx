"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ACTIONS, EVENTS, Joyride, type EventData } from "react-joyride";
import { BookOpen, CircleHelp, Map, MessageSquare, Ticket, UserRoundCheck } from "lucide-react";
import type { PublicUser } from "@/lib/auth/session";
import {
  guideStorageKey,
  overviewTourId,
  tourFor,
  tourForPath,
  type TourId,
} from "@/lib/help/tours";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type HelpContextValue = {
  abrirAjuda: () => void;
  iniciarTour: (id: TourId) => void;
  encerrarTour: () => void;
  reiniciarTour: () => void;
  tourDaTela: TourId | null;
  userRole: PublicUser["role"];
};

const HelpContext = createContext<HelpContextValue | null>(null);

function markGuideSeen(userId: string) {
  try {
    window.localStorage.setItem(guideStorageKey(userId), "seen");
  } catch {
    // O guia continua funcionando quando o navegador bloqueia o armazenamento local.
  }
}

function hasSeenGuide(userId: string) {
  try {
    return window.localStorage.getItem(guideStorageKey(userId)) === "seen";
  } catch {
    return false;
  }
}

export function HelpProvider({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeTourId, setActiveTourId] = useState<TourId>(() => overviewTourId(user.role));
  const [run, setRun] = useState(false);
  const [compact, setCompact] = useState(false);
  const [pendingOverview, setPendingOverview] = useState(false);
  const tourDaTela = tourForPath(pathname, user.role);
  const definition = useMemo(() => tourFor(activeTourId, user.role, compact), [activeTourId, compact, user.role]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (pathname !== "/") return;
    if (!pendingOverview && hasSeenGuide(user.id)) return;
    const timer = window.setTimeout(() => {
      markGuideSeen(user.id);
      setActiveTourId(overviewTourId(user.role));
      setRun(true);
      setPendingOverview(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [pathname, pendingOverview, user.id, user.role]);

  const encerrarTour = useCallback(() => {
    markGuideSeen(user.id);
    setRun(false);
  }, [user.id]);

  const iniciarTour = useCallback((id: TourId) => {
    setHelpOpen(false);
    setRun(false);
    setActiveTourId(id);
    window.setTimeout(() => setRun(true), 50);
  }, []);

  const reiniciarTour = useCallback(() => {
    if (pathname === "/") {
      iniciarTour(overviewTourId(user.role));
      return;
    }
    setHelpOpen(false);
    setRun(false);
    setPendingOverview(true);
    router.push("/");
  }, [iniciarTour, pathname, router, user.role]);

  function onTourEvent(data: EventData) {
    if (data.type === EVENTS.TOUR_END || data.action === ACTIONS.CLOSE || data.action === ACTIONS.SKIP) {
      encerrarTour();
    }
  }

  const context = useMemo<HelpContextValue>(
    () => ({
      abrirAjuda: () => setHelpOpen(true),
      iniciarTour,
      encerrarTour,
      reiniciarTour,
      tourDaTela,
      userRole: user.role,
    }),
    [encerrarTour, iniciarTour, reiniciarTour, tourDaTela, user.role],
  );

  return (
    <HelpContext.Provider value={context}>
      {children}
      <Joyride
        key={`${definition.id}-${compact ? "compact" : "wide"}`}
        run={run}
        continuous
        scrollToFirstStep
        steps={definition.steps}
        onEvent={onTourEvent}
        locale={{
          back: "Voltar",
          close: "Fechar",
          last: "Concluir",
          next: "Próximo",
          nextWithProgress: "Próximo ({current} de {total})",
          open: "Abrir explicação",
          skip: "Pular guia",
        }}
        options={{
          blockTargetInteraction: true,
          buttons: ["back", "skip", "close", "primary"],
          closeButtonAction: "skip",
          dismissKeyAction: "close",
          overlayClickAction: false,
          overlayColor: "rgba(15, 23, 42, 0.58)",
          primaryColor: "var(--primary)",
          backgroundColor: "var(--popover)",
          textColor: "var(--popover-foreground)",
          arrowColor: "var(--popover)",
          showProgress: true,
          skipBeacon: true,
          spotlightPadding: 6,
          spotlightRadius: 8,
          targetWaitTimeout: 2500,
          width: "min(23rem, calc(100vw - 2rem))",
          zIndex: 80,
        }}
        styles={{
          tooltip: { borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)" },
          tooltipTitle: { fontSize: "1rem", fontWeight: 650, lineHeight: 1.35 },
          tooltipContent: { fontSize: "0.875rem", lineHeight: 1.55 },
          buttonPrimary: { borderRadius: "0.5rem", padding: "0.55rem 0.8rem" },
          buttonBack: { color: "var(--muted-foreground)" },
          buttonSkip: { color: "var(--muted-foreground)" },
        }}
      />
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent className="w-[min(100vw,26rem)] overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>Ajuda do Juricon</SheetTitle>
            <SheetDescription>Escolha uma explicação rápida ou consulte o manual completo.</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-5">
            <div className="grid gap-2">
              <Button type="button" className="justify-start" onClick={reiniciarTour}>
                <Map />
                Conhecer o sistema
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                disabled={!tourDaTela}
                onClick={() => tourDaTela && iniciarTour(tourDaTela)}
              >
                <CircleHelp />
                Guia desta tela
              </Button>
              <Button
                variant="ghost"
                className="justify-start"
                render={<Link href="/ajuda" onClick={() => setHelpOpen(false)} />}
              >
                <BookOpen />
                Abrir manual completo
              </Button>
            </div>

            <section aria-labelledby="tarefas-comuns-ajuda">
              <h2 id="tarefas-comuns-ajuda" className="text-sm font-semibold text-foreground">
                Tarefas comuns
              </h2>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
                <li>
                  <Link href="/ajuda#atender" onClick={() => setHelpOpen(false)} className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted">
                    <MessageSquare className="size-4 text-primary" /> Atender uma mensagem
                  </Link>
                </li>
                {user.role === "admin" ? (
                  <li>
                    <Link href="/ajuda#identificar" onClick={() => setHelpOpen(false)} className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted">
                      <UserRoundCheck className="size-4 text-primary" /> Identificar um novo contato
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link href="/ajuda#chamados" onClick={() => setHelpOpen(false)} className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted">
                    <Ticket className="size-4 text-primary" /> {user.role === "admin" ? "Criar e acompanhar um chamado" : "Acompanhar um chamado"}
                  </Link>
                </li>
                <li>
                  <Link href="/ajuda#documentos" onClick={() => setHelpOpen(false)} className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted">
                    <BookOpen className="size-4 text-primary" /> Cadastrar um documento
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </HelpContext.Provider>
  );
}

export function HelpButton() {
  const { abrirAjuda } = useHelp();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-11 px-2 sm:min-h-8 sm:px-3"
      onClick={abrirAjuda}
      data-tour="help"
      aria-label="Abrir ajuda do Juricon"
    >
      <CircleHelp className="size-4" />
      <span className="hidden sm:inline">Ajuda</span>
    </Button>
  );
}

export function useHelp() {
  const value = useContext(HelpContext);
  if (!value) throw new Error("useHelp deve ser usado dentro de HelpProvider");
  return value;
}

