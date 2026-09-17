import { ChannelType } from "@prisma/client";
import { hashPassword } from "../lib/auth/session";
import { prisma } from "../lib/db/prisma";

async function main() {
  const adminPass = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPass) {
    throw new Error("SEED_ADMIN_PASSWORD is required");
  }

  const admin = await prisma.user.upsert({
    where: { email: "admin@juricon.local" },
    update: {
      passwordHash: await hashPassword(adminPass),
      role: "admin",
      ativo: true,
      nome: "Administradora",
      deletedAt: null,
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

  const baileys = await prisma.channelConnection.findFirst({
    where: { type: ChannelType.evolution_baileys },
  });
  if (!baileys) {
    await prisma.channelConnection.create({
      data: {
        type: ChannelType.evolution_baileys,
        status: "close",
        label: "WhatsApp Escritório (Web / QR)",
        metadataJson: { official: false },
      },
    });
  }

  console.log("Seed ok:", admin.email, "(sem funcionário demo, sem DevMock/Cloud)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
