"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CircleHelp,
  FileText,
  Inbox,
  ListChecks,
  MessageSquare,
  Radio,
  Ticket,
  UserRoundX,
  Users,
} from "lucide-react";
import { useHelp } from "@/components/help/help-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

const AREAS = [
  { name: "Visão", icon: CircleHelp, text: "Resume o que precisa de atenção agora e mostra os atalhos do dia." },
  { name: "Atendimento", icon: Inbox, text: "Mostra as conversas e permite responder ao cliente pelo WhatsApp." },
  { name: "Triagem", icon: ListChecks, text: "Organiza o pedido antes de ele virar um chamado acompanhado pelo escritório.", admin: true },
  { name: "Não vinculados", icon: UserRoundX, text: "Identifica quem enviou uma mensagem de um número ainda não cadastrado.", admin: true },
  { name: "Chamados", icon: Ticket, text: "Acompanha cada caso, com responsável, prioridade, situação e histórico." },
  { name: "Documentos", icon: FileText, text: "Guarda os arquivos de cada condomínio e permite ligá-los a um chamado." },
  { name: "Condomínios", icon: Building2, text: "Reúne os dados do condomínio e as pessoas ligadas a ele." },
  { name: "Equipe", icon: Users, text: "Cadastra quem trabalha no escritório e controla quem pode entrar no sistema.", admin: true },
  { name: "Conexões", icon: Radio, text: "Mostra se o WhatsApp está conectado e permite ler um novo QR Code.", admin: true },
  { name: "Mensagens automáticas", icon: MessageSquare, text: "Configura respostas automáticas para situações definidas pelo escritório.", admin: true },
];

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-3 space-y-3 [counter-reset:passo]">{children}</ol>;
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-muted-foreground before:flex before:size-6 before:shrink-0 before:items-center before:justify-center before:rounded-full before:bg-primary before:text-xs before:font-semibold before:text-primary-foreground before:[content:counter(passo)] [counter-increment:passo]">
      <span>{children}</span>
    </li>
  );
}

export default function AjudaPage() {
  const { reiniciarTour, tourDaTela, iniciarTour, userRole } = useHelp();
  const admin = userRole === "admin";

  return (
    <div className="pb-8">
      <PageHeader
        title="Como usar o Juricon"
        description="Um guia direto, sem termos técnicos, para entender o sistema e trabalhar com segurança."
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={reiniciarTour}>
              Conhecer o sistema
            </Button>
            {tourDaTela ? (
              <Button type="button" onClick={() => iniciarTour(tourDaTela)}>
                Guia desta tela
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="space-y-8">
        <section aria-labelledby="o-que-e">
          <Card className="border-l-4 border-l-primary">
            <h2 id="o-que-e" className="text-lg font-semibold">O que é o Juricon?</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              O Juricon organiza as mensagens recebidas pelo escritório, ajuda a identificar o pedido do cliente e permite acompanhar cada caso até a conclusão. Ele é usado pela administradora e pela equipe do escritório; o síndico não entra neste sistema.
            </p>
          </Card>
        </section>

        <section aria-labelledby="caminho-solicitacao">
          <h2 id="caminho-solicitacao" className="text-lg font-semibold">O caminho de uma solicitação</h2>
          <p className="mt-1 text-sm text-muted-foreground">Este é o caminho mais comum desde a chegada da mensagem.</p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            {["Mensagem recebida", "Identificar contato", "Fazer triagem", "Criar chamado", "Atender", "Concluir"].map((label, index) => (
              <li key={label} className="relative rounded-lg border border-border bg-card p-3 text-sm font-medium">
                <span className="mb-2 block text-xs text-primary">Passo {index + 1}</span>
                {label}
                {index < 5 ? <ArrowRight className="absolute top-1/2 -right-3 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground xl:block" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="areas-juricon">
          <h2 id="areas-juricon" className="text-lg font-semibold">Para que serve cada área</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {AREAS.filter((area) => admin || !area.admin).map((area) => {
              const Icon = area.icon;
              return (
                <Card key={area.name} className="p-4 shadow-none">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <h3 className="font-semibold">{area.name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{area.text}</p>
                      {area.admin ? <p className="mt-2 text-xs font-medium text-primary">Somente administradora</p> : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="tarefas-comuns">
          <h2 id="tarefas-comuns" className="text-lg font-semibold">Tarefas comuns</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card id="atender" className="scroll-mt-20">
              <h3 className="font-semibold">Atender uma mensagem</h3>
              <Steps>
                <Step>Abra <strong>Atendimento</strong> e escolha uma pessoa na lista de conversas.</Step>
                <Step>Leia as mensagens e confira o painel <strong>Contexto</strong>.</Step>
                <Step>Escreva a resposta no campo inferior e revise o texto.</Step>
                <Step>Clique em <strong>Enviar</strong>. Essa ação envia a mensagem pelo WhatsApp.</Step>
              </Steps>
              <Button className="mt-4" variant="outline" render={<Link href="/atendimento" />}>Abrir Atendimento</Button>
            </Card>

            {admin ? <Card id="identificar" className="scroll-mt-20">
              <h3 className="font-semibold">Identificar um novo contato</h3>
              <Steps>
                <Step>Abra <strong>Não vinculados</strong> e escolha a mensagem.</Step>
                <Step>Clique em <strong>Vincular ao fluxo</strong>.</Step>
                <Step>Informe o nome e escolha o condomínio correto.</Step>
                <Step>Confirme o vínculo. A conversa vai para a Triagem; isso ainda não cria chamado.</Step>
              </Steps>
              <Button className="mt-4" variant="outline" render={<Link href="/nao-vinculados" />}>Abrir Não vinculados</Button>
            </Card> : null}

            <Card id="chamados" className="scroll-mt-20">
              <h3 className="font-semibold">{admin ? "Criar e acompanhar um chamado" : "Acompanhar um chamado"}</h3>
              <Steps>
                {admin ? <Step>Na <strong>Triagem</strong>, escolha a solicitação, defina categoria, prioridade e responsável e clique em <strong>Criar chamado</strong>.</Step> : null}
                <Step>Depois, abra <strong>Chamados</strong> e selecione o cartão para acompanhar o caso.</Step>
                <Step>Use <strong>Meus</strong> para ver os chamados que estão sob sua responsabilidade.</Step>
              </Steps>
              <Button className="mt-4" variant="outline" render={<Link href="/chamados" />}>Abrir Chamados</Button>
            </Card>

            <Card id="documentos" className="scroll-mt-20">
              <h3 className="font-semibold">Cadastrar um documento</h3>
              <Steps>
                <Step>Abra <strong>Documentos</strong> e escolha o condomínio.</Step>
                <Step>Clique em <strong>Novo documento</strong>.</Step>
                <Step>Informe o nome, para que serve e escolha o arquivo.</Step>
                <Step>Clique em <strong>Salvar documento</strong>. Marque envio ao cliente somente quando o arquivo puder ser enviado pelo WhatsApp.</Step>
              </Steps>
              <Button className="mt-4" variant="outline" render={<Link href="/documentos" />}>Abrir Documentos</Button>
            </Card>
          </div>
        </section>

        <section aria-labelledby="antes-de-clicar">
          <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <div>
                <h2 id="antes-de-clicar" className="font-semibold">Atenção antes de clicar</h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li><strong>Enviar</strong> e <strong>Aprovar</strong> podem mandar uma mensagem real pelo WhatsApp.</li>
                  <li><strong>Criar chamado</strong> transforma a triagem em um caso acompanhado pelo escritório.</li>
                  <li><strong>Excluir do sistema</strong> remove a conversa do Juricon, mas não apaga o WhatsApp do celular.</li>
                  <li>O passeio guiado apenas explica a tela: ele nunca envia, cria ou exclui nada.</li>
                </ul>
              </div>
            </div>
          </Card>
        </section>

        <section aria-labelledby="duvidas-frequentes">
          <h2 id="duvidas-frequentes" className="text-lg font-semibold">Dúvidas frequentes</h2>
          <dl className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            <div className="p-4"><dt className="font-semibold">Conversa e chamado são a mesma coisa?</dt><dd className="mt-1 text-sm leading-relaxed text-muted-foreground">Não. A conversa reúne as mensagens. O chamado é o caso que o escritório acompanha, com responsável, prioridade e situação.</dd></div>
            <div className="p-4"><dt className="font-semibold">O que é triagem?</dt><dd className="mt-1 text-sm leading-relaxed text-muted-foreground">É a etapa de entender e organizar o pedido antes de criar o chamado.</dd></div>
            <div className="p-4"><dt className="font-semibold">Para que servem os documentos?</dt><dd className="mt-1 text-sm leading-relaxed text-muted-foreground">Eles guardam arquivos do condomínio ou do escritório e podem ser ligados a um chamado quando ajudam naquele caso.</dd></div>
            <div className="p-4"><dt className="font-semibold">Quem pode usar o Juricon?</dt><dd className="mt-1 text-sm leading-relaxed text-muted-foreground">A administradora e os funcionários cadastrados. O síndico não recebe acesso ao portal.</dd></div>
          </dl>
        </section>

        <section className="flex flex-col items-start gap-3 rounded-lg bg-secondary p-5 sm:flex-row sm:items-center sm:justify-between" aria-label="Repetir apresentação">
          <div><h2 className="font-semibold">Quer ver tudo na própria tela?</h2><p className="mt-1 text-sm text-muted-foreground">O passeio destaca cada área sem alterar nenhum dado.</p></div>
          <Button type="button" onClick={reiniciarTour}><BookOpen /> Conhecer o sistema</Button>
        </section>
      </div>
    </div>
  );
}

