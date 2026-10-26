import type { Step } from "react-joyride";
import type { UserRole } from "@prisma/client";

export const GUIDE_VERSION = "v1";

export type TourId =
  | "visao-admin"
  | "visao-funcionario"
  | "atendimento"
  | "triagem"
  | "nao-vinculados"
  | "chamados";

export type TourDefinition = {
  id: TourId;
  title: string;
  steps: Step[];
};

const step = (target: string, title: string, content: string, placement: Step["placement"] = "bottom"): Step => ({
  target,
  title,
  content,
  placement,
});

function overviewTour(role: UserRole, compact: boolean): TourDefinition {
  const admin = role === "admin";
  const id: TourId = admin ? "visao-admin" : "visao-funcionario";

  if (compact) {
    return {
      id,
      title: "Conhecer o sistema",
      steps: [
        step(
          '[data-tour="overview"]',
          "Bem-vindo ao Juricon",
          "O Juricon reúne as mensagens do escritório, organiza cada pedido e ajuda a acompanhar os casos até a conclusão.",
        ),
        step(
          '[data-tour="overview-actions"]',
          "Atalhos do dia a dia",
          admin
            ? "Use estes atalhos para abrir o Atendimento, classificar uma solicitação na Triagem ou identificar um número desconhecido."
            : "Use estes atalhos para abrir o Atendimento e continuar o trabalho do dia.",
        ),
        step(
          '[data-tour="overview-queue"]',
          "O que precisa de atenção",
          "Estes números mostram as filas do escritório. Toque em um cartão para abrir a área correspondente.",
        ),
        step(
          '[data-tour="mobile-navigation"]',
          "Áreas principais",
          "A barra inferior leva à Visão, ao Atendimento e aos Chamados. As outras áreas ficam em Mais.",
          "top",
        ),
        step(
          '[data-tour="mobile-more"]',
          "Documentos e outras áreas",
          admin
            ? "Em Mais ficam Documentos, Condomínios, Não vinculados, Equipe, Conexões e Mensagens automáticas."
            : "Em Mais ficam Documentos, Documentos do sistema e Condomínios.",
          "top",
        ),
        step(
          '[data-tour="help"]',
          "Ajuda sempre disponível",
          "Quando tiver dúvida, toque aqui para repetir este passeio, abrir o guia da tela ou consultar o manual completo.",
          "bottom-end",
        ),
      ],
    };
  }

  const steps: Step[] = [
    step(
      '[data-tour="overview"]',
      "Bem-vindo ao Juricon",
      "O Juricon reúne as mensagens do escritório, organiza cada pedido e ajuda a acompanhar os casos até a conclusão.",
    ),
    step('[data-tour="nav-overview"]', "Visão", "Aqui você encontra as pendências e o que precisa de atenção agora.", "right"),
    step(
      '[data-tour="nav-atendimento"]',
      "Atendimento",
      "É onde a equipe lê as mensagens recebidas e responde ao cliente pelo WhatsApp.",
      "right",
    ),
  ];

  if (admin) {
    steps.push(
      step(
        '[data-tour="nav-triagem"]',
        "Triagem",
        "Use esta área para entender o pedido, escolher a prioridade e definir quem ficará responsável.",
        "right",
      ),
      step(
        '[data-tour="nav-nao-vinculados"]',
        "Não vinculados",
        "Aqui ficam mensagens de números que ainda precisam ser ligados a uma pessoa e a um condomínio.",
        "right",
      ),
    );
  }

  steps.push(
    step(
      '[data-tour="nav-chamados"]',
      "Chamados",
      "Acompanhe o caso, o responsável, a prioridade e a situação de cada solicitação.",
      "right",
    ),
    step(
      '[data-tour="nav-documentos"]',
      "Documentos",
      "Guarde e consulte os arquivos de cada condomínio. Alguns documentos também podem apoiar a análise do atendimento.",
      "right",
    ),
    step(
      '[data-tour="help"]',
      "Ajuda sempre disponível",
      "Quando tiver dúvida, clique aqui para repetir este passeio, abrir o guia da tela ou consultar o manual completo.",
      "bottom-end",
    ),
  );

  return { id, title: "Conhecer o sistema", steps };
}

const PAGE_TOURS: Record<Exclude<TourId, "visao-admin" | "visao-funcionario">, TourDefinition> = {
  atendimento: {
    id: "atendimento",
    title: "Guia do Atendimento",
    steps: [
      step('[data-tour="atendimento"]', "Atendimento", "Esta é a fila das conversas recebidas pelo escritório."),
      step(
        '[data-tour="atendimento-lista"]',
        "Escolha uma conversa",
        "A lista mostra quem escreveu e avisa quando existem mensagens que ninguém abriu.",
        "right",
      ),
      step(
        '[data-tour="atendimento-conversa"]',
        "Leia a conversa",
        "Ao escolher uma pessoa, as mensagens aparecem aqui. No celular, esta parte abre depois de tocar na conversa.",
      ),
      step(
        '[data-tour="atendimento-contexto"]',
        "Entenda o caso",
        "O painel reúne condomínio, triagem, chamado e outras informações importantes para atender com segurança.",
        "left",
      ),
      step(
        '[data-tour-response="atendimento-resposta"]',
        "Responda ao cliente",
        "Escreva a mensagem e confira antes de enviar. O botão Enviar manda a resposta pelo WhatsApp.",
        "top",
      ),
    ],
  },
  triagem: {
    id: "triagem",
    title: "Guia da Triagem",
    steps: [
      step('[data-tour="triagem"]', "Triagem", "Aqui ficam as solicitações que ainda precisam ser organizadas."),
      step(
        '[data-tour="triagem-classificacao"]',
        "Escolha uma solicitação",
        "Selecione uma pessoa para ler o pedido e abrir a classificação.",
        "right",
      ),
      step(
        '[data-tour="triagem-classificacao"]',
        "Classifique o pedido",
        "Confira o título, escolha categoria, prioridade e responsável. Criar chamado transforma a solicitação em um caso acompanhado pelo escritório.",
        "left",
      ),
    ],
  },
  "nao-vinculados": {
    id: "nao-vinculados",
    title: "Guia de Não vinculados",
    steps: [
      step(
        '[data-tour="nao-vinculados"]',
        "Números ainda não identificados",
        "Esta fila recebe mensagens de pessoas que ainda não estão ligadas a um condomínio.",
      ),
      step(
        '[data-tour="nao-vinculados-lista"]',
        "Escolha a mensagem",
        "Selecione a pessoa para conferir a conversa e os dados recebidos do WhatsApp.",
        "right",
      ),
      step(
        '[data-tour="nao-vinculados-identidade"]',
        "Identifique a pessoa",
        "Use Vincular ao fluxo, informe o nome e escolha o condomínio. Isso abre uma triagem, mas ainda não cria um chamado.",
        "left",
      ),
    ],
  },
  chamados: {
    id: "chamados",
    title: "Guia de Chamados",
    steps: [
      step(
        '[data-tour="chamados"]',
        "Chamados",
        "Cada chamado representa um caso que precisa ser acompanhado pelo escritório.",
      ),
      step(
        '[data-tour="chamados-visualizacao"]',
        "Quadro ou lista",
        "Escolha a visualização que ficar mais confortável. As duas mostram os mesmos chamados.",
      ),
      step(
        '[data-tour="chamados-filtros"]',
        "Encontre o que precisa",
        "Use Todos, Meus e os filtros avançados para reduzir a lista.",
      ),
      step(
        '[data-tour="chamados-conteudo"]',
        "Abra a ficha",
        "Selecione um cartão ou uma linha para ver o caso, documentos, mensagens e histórico.",
        "top",
      ),
    ],
  },
};

export function tourFor(id: TourId, role: UserRole, compact: boolean): TourDefinition {
  if (id === "visao-admin" || id === "visao-funcionario") return overviewTour(role, compact);
  const definition = PAGE_TOURS[id];
  if (!compact) return definition;

  if (id === "atendimento") {
    return {
      ...definition,
      steps: [
        definition.steps[0],
        definition.steps[1],
        step(
          '[data-tour="atendimento"]',
          "Conversa, contexto e resposta",
          "Toque em uma pessoa para abrir as mensagens. Depois, use Contexto para entender o caso e escreva no campo inferior. Enviar manda a resposta pelo WhatsApp.",
        ),
      ],
    };
  }

  if (id === "triagem") {
    return {
      ...definition,
      steps: [
        definition.steps[0],
        step(
          '[data-tour="triagem-classificacao"]',
          "Escolha e classifique",
          "Toque em uma solicitação. Na tela seguinte, confira a conversa, escolha categoria, prioridade e responsável e use Criar chamado.",
        ),
      ],
    };
  }

  if (id === "nao-vinculados") {
    return {
      ...definition,
      steps: [
        definition.steps[0],
        definition.steps[1],
        step(
          '[data-tour="nao-vinculados"]',
          "Identifique a pessoa",
          "Depois de escolher a mensagem, toque em Vincular ao fluxo, informe o nome e o condomínio. Isso abre uma triagem, mas ainda não cria chamado.",
        ),
      ],
    };
  }

  return definition;
}

export function overviewTourId(role: UserRole): TourId {
  return role === "admin" ? "visao-admin" : "visao-funcionario";
}

export function tourForPath(pathname: string, role: UserRole): TourId | null {
  if (pathname === "/") return overviewTourId(role);
  if (pathname.startsWith("/atendimento")) return "atendimento";
  if (role !== "admin") return pathname.startsWith("/chamados") ? "chamados" : null;
  if (pathname.startsWith("/triagem")) return "triagem";
  if (pathname.startsWith("/nao-vinculados")) return "nao-vinculados";
  if (pathname.startsWith("/chamados")) return "chamados";
  return null;
}

export function guideStorageKey(userId: string): string {
  return `juricon:guide:${userId}:${GUIDE_VERSION}`;
}

