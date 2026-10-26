"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ACTIONS, EVENTS, Joyride, type EventData } from "react-joyride";
import { ArrowRight, BookOpen, CircleHelp, Map, MessageSquare, Sparkles, Ticket, UserRoundCheck } from "lucide-react";
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
import { TourTooltip } from "@/components/help/tour-tooltip";

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
        tooltipComponent={TourTooltip}
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
          offset: compact ? 12 : 16,
          scrollDuration: 180,
          scrollOffset: compact ? 88 : 72,
          spotlightPadding: compact ? 4 : 6,
          spotlightRadius: 10,
          targetWaitTimeout: 2500,
          width: "min(25rem, calc(100vw - 1.5rem))",
          zIndex: 90,
        }}
        styles={{
          floater: { filter: "none", maxWidth: "calc(100vw - 1rem)" },
          tooltip: { backgroundColor: "transparent", padding: 0 },
        }}
      />
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact
            ? "max-h-[92dvh] w-full gap-0 overflow-y-auto rounded-t-2xl border-t border-border p-0"
            : "w-[26rem] gap-0 overflow-y-auto p-0 sm:max-w-[26rem]"}
        >
          <SheetHeader className="border-b border-border bg-secondary/55 px-5 py-5 pr-14">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-5" aria-hidden />
            </div>
            <SheetTitle className="text-lg font-semibold">Como podemos ajudar?</SheetTitle>
            <SheetDescription className="leading-relaxed">Aprenda no seu ritmo. Nenhuma opção abaixo altera informações do sistema.</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 px-4 py-5 sm:px-5">
            <div className="grid gap-3">
              <button type="button" className="group flex min-h-20 w-full items-center gap-4 rounded-xl bg-primary p-4 text-left text-primary-foreground shadow-sm transition-colors hover:bg-[var(--brand-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={reiniciarTour}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15"><Map className="size-5" aria-hidden /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">Conhecer o sistema</strong><span className="mt-0.5 block text-xs leading-5 text-primary-foreground/80">Passeio completo pelas áreas principais.</span></span>
                <ArrowRight className="size-4 shrink-0 opacity-75 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
              <button type="button" className="group flex min-h-20 w-full items-center gap-4 rounded-xl border border-border-strong bg-card p-4 text-left text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={!tourDaTela} onClick={() => tourDaTela && iniciarTour(tourDaTela)}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><CircleHelp className="size-5" aria-hidden /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">Guia desta tela</strong><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Entenda apenas a página que está aberta.</span></span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
              <Link href="/ajuda" onClick={() => setHelpOpen(false)} className="group flex min-h-20 w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><BookOpen className="size-5" aria-hidden /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">Manual completo</strong><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Consulte tarefas e cuidados quando quiser.</span></span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>

            <section aria-labelledby="tarefas-comuns-ajuda">
              <h2 id="tarefas-comuns-ajuda" className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Tarefas comuns
              </h2>
              <ul className="mt-3 divide-y divide-border border-y border-border">
                <li>
                  <Link href="/ajuda#atender" onClick={() => setHelpOpen(false)} className="flex min-h-12 items-center gap-3 px-1 py-3 text-sm hover:text-primary">
                    <MessageSquare className="size-4 text-primary" /> Atender uma mensagem
                  </Link>
                </li>
                {user.role === "admin" ? (
                  <li>
                    <Link href="/ajuda#identificar" onClick={() => setHelpOpen(false)} className="flex min-h-12 items-center gap-3 px-1 py-3 text-sm hover:text-primary">
                      <UserRoundCheck className="size-4 text-primary" /> Identificar um novo contato
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link href="/ajuda#chamados" onClick={() => setHelpOpen(false)} className="flex min-h-12 items-center gap-3 px-1 py-3 text-sm hover:text-primary">
                    <Ticket className="size-4 text-primary" /> {user.role === "admin" ? "Criar e acompanhar um chamado" : "Acompanhar um chamado"}
                  </Link>
                </li>
                <li>
                  <Link href="/ajuda#documentos" onClick={() => setHelpOpen(false)} className="flex min-h-12 items-center gap-3 px-1 py-3 text-sm hover:text-primary">
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

