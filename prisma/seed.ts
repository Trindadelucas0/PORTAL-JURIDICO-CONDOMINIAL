import { ChannelType } from "@prisma/client";
import { hashPassword } from "../lib/auth/session";
import { prisma } from "../lib/db/prisma";

async function main() {
  const adminPass = process.env.SEED_ADMIN_PASSWORD;
  const staffPass = process.env.SEED_FUNCIONARIO_PASSWORD || adminPass;
  if (!adminPass) {
    throw new Error("SEED_ADMIN_PASSWORD is required");
  }

  const admin = await prisma.user.upsert({
    where: { email: "admin@juricon.local" },
    update: {
      passwordHash: await hashPassword(adminPass),
      role: "admin",
      ativo: true,
      deletedAt: null,
    },
    create: {
      email: "admin@juricon.local",
      passwordHash: await hashPassword(adminPass),
      role: "admin",
      ativo: true,
      podeResponderCliente: true,
      apenasRascunho: false,
    },
  });

  await prisma.user.upsert({
    where: { email: "funcionario@juricon.local" },
    update: {
      passwordHash: await hashPassword(staffPass!),
      role: "funcionario",
      ativo: true,
      deletedAt: null,
      podeResponderCliente: false,
      apenasRascunho: true,
    },
    create: {
      email: "funcionario@juricon.local",
      passwordHash: await hashPassword(staffPass!),
      role: "funcionario",
      ativo: true,
      podeResponderCliente: false,
      apenasRascunho: true,
    },
  });

  const mock = await prisma.channelConnection.findFirst({ where: { type: ChannelType.dev_mock } });
  if (!mock) {
    await prisma.channelConnection.create({
      data: {
        type: ChannelType.dev_mock,
        status: "open",
        label: "Dev / mock",
        metadataJson: { env: "development" },
      },
    });
  }

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

  const cloud = await prisma.channelConnection.findFirst({
    where: { type: ChannelType.evolution_cloud },
  });
  if (!cloud) {
    await prisma.channelConnection.create({
      data: {
        type: ChannelType.evolution_cloud,
        status: "close",
        label: "WhatsApp Cloud",
        metadataJson: { official: true, configured: false },
      },
    });
  }

  console.log("Seed ok:", admin.email, "funcionario@juricon.local");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
