import { ChannelType } from "@prisma/client";
import { prisma } from "../../lib/db/prisma";

const CONDO_NAME = "Residencial Demo";
const CONTACT_NAME = "Síndico Demo";
const PHONE = "+5511988880001";

async function main() {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const name = rows[0]?.current_database;
  if (name !== "PORTAL-JURIDICO-GUIA") {
    throw new Error(`Abortado: banco atual é "${name ?? "?"}". Este script só roda em PORTAL-JURIDICO-GUIA.`);
  }

  const condo = await prisma.condominium.upsert({
    where: { id: "00000000-0000-4000-8000-0000000000a1" },
    update: { nome: CONDO_NAME, cidadeUf: "Goiania/GO", deletedAt: null },
    create: {
      id: "00000000-0000-4000-8000-0000000000a1",
      nome: CONDO_NAME,
      cnpj: "00.000.000/0001-91",
      endereco: "Rua Demonstracao, 100",
      cidadeUf: "Goiania/GO",
      observacao: "Condominio ficticio usado so no guia visual.",
    },
  });

  const contact = await prisma.contact.upsert({
    where: { phoneE164: PHONE },
    update: { nome: CONTACT_NAME, cargo: "Sindico", condominiumId: condo.id, deletedAt: null },
    create: {
      nome: CONTACT_NAME,
      phoneE164: PHONE,
      cargo: "Sindico",
      condominiumId: condo.id,
    },
  });

  await prisma.contactCondominium.upsert({
    where: { contactId_condominiumId: { contactId: contact.id, condominiumId: condo.id } },
    update: {},
    create: { contactId: contact.id, condominiumId: condo.id },
  });

  await prisma.contactIdentity.upsert({
    where: { value: PHONE },
    update: { contactId: contact.id, kind: "phone" },
    create: { contactId: contact.id, kind: "phone", value: PHONE },
  });

  const mock = await prisma.channelConnection.findFirst({ where: { type: ChannelType.dev_mock } });
  if (!mock) {
    await prisma.channelConnection.create({
      data: {
        type: ChannelType.dev_mock,
        status: "open",
        label: "Canal de demonstracao",
        metadataJson: { demo: true },
      },
    });
  }

  console.log(`Demo ok: ${condo.nome} | ${contact.nome} | ${PHONE}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "falha");
    await prisma.$disconnect();
    process.exit(1);
  });
