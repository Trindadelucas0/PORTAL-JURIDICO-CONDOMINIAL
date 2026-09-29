/**
 * Popula só o banco PORTAL-JURIDICO-GUIA com dados fictícios do guia visual.
 * Uso:
 *   DATABASE_URL=...PORTAL-JURIDICO-GUIA... SEED_ADMIN_PASSWORD=... npx tsx prisma/seed-guia-demo.ts
 */
import { ChannelType } from "@prisma/client";
import { hashPassword } from "../lib/auth/session";
import { prisma } from "../lib/db/prisma";

async function main() {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  const dbName = rows[0]?.current_database;
  if (dbName !== "PORTAL-JURIDICO-GUIA") {
    throw new Error(
      `Abortado: banco atual é "${dbName ?? "?"}". Só popula "PORTAL-JURIDICO-GUIA".`,
    );
  }

  const adminPass = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPass) throw new Error("SEED_ADMIN_PASSWORD is required");

  const admin = await prisma.user.upsert({
    where: { email: "admin@juricon.local" },
    update: {
      passwordHash: await hashPassword(adminPass),
      role: "admin",
      ativo: true,
      nome: "Administradora",
      deletedAt: null,
      podeResponderCliente: true,
      apenasRascunho: false,
    },
    create: {
      email: "admin@juricon.local",
      nome: "Administradora",
      passwordHash: await hashPassword(adminPass),
      role: "admin",
      ativo: true,
      podeResponderCliente: true,
      apenasRascunho: false,
    },
  });
  console.log("admin", admin.email);

  let condo = await prisma.condominium.findFirst({
    where: { nome: "Residencial Demo Guia", deletedAt: null },
  });
  if (!condo) {
    condo = await prisma.condominium.create({
      data: {
        nome: "Residencial Demo Guia",
        cnpj: "12.345.678/0001-90",
        cidadeUf: "Belo Horizonte/MG",
        endereco: "Rua das Acacias, 100, Belo Horizonte/MG",
        observacao: "Condominio ficticio para o guia visual",
      },
    });
  }
  console.log("condo", condo.id, condo.nome);

  let contact = await prisma.contact.findFirst({ where: { phoneE164: "+5531999000001" } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        nome: "Sindico Demo",
        phoneE164: "+5531999000001",
        cargo: "Sindico",
        email: "sindico.demo@exemplo.local",
        condominiumId: condo.id,
      },
    });
  } else {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        nome: "Sindico Demo",
        cargo: "Sindico",
        condominiumId: condo.id,
        deletedAt: null,
      },
    });
  }

  await prisma.contactCondominium.upsert({
    where: {
      contactId_condominiumId: { contactId: contact.id, condominiumId: condo.id },
    },
    update: {},
    create: { contactId: contact.id, condominiumId: condo.id },
  });

  await prisma.contactIdentity.upsert({
    where: { value: "+5531999000001" },
    update: { contactId: contact.id, kind: "phone" },
    create: { contactId: contact.id, kind: "phone", value: "+5531999000001" },
  });
  console.log("contact", contact.id, contact.nome);

  let mock = await prisma.channelConnection.findFirst({ where: { type: ChannelType.dev_mock } });
  if (!mock) {
    mock = await prisma.channelConnection.create({
      data: {
        type: ChannelType.dev_mock,
        status: "open",
        label: "Simulador Guia (dev_mock)",
        metadataJson: { official: false, guia: true },
      },
    });
  } else {
    mock = await prisma.channelConnection.update({
      where: { id: mock.id },
      data: { status: "open", label: "Simulador Guia (dev_mock)" },
    });
  }
  console.log("channel", mock.id, mock.type);
  console.log("ok banco", dbName);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
