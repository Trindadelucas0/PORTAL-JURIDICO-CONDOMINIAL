import { rm } from "node:fs/promises";
import path from "node:path";
import { ChannelType } from "@prisma/client";
import { prisma } from "../lib/db/prisma";

const ALLOWED_DATABASE = "PORTAL-JURIDICO";
const DEMO_STAFF_EMAIL = "funcionario@juricon.local";
const ADMIN_EMAIL = "admin@juricon.local";

async function assertPortalDatabase() {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  const name = rows[0]?.current_database;
  if (name !== ALLOWED_DATABASE) {
    throw new Error(
      `Abortado: banco atual é "${name ?? "?"}". Só limpa "${ALLOWED_DATABASE}".`,
    );
  }
}

async function main() {
  await assertPortalDatabase();

  const result = await prisma.$transaction(async (tx) => {
    const automationExecutions = await tx.automationExecution.deleteMany();
    const attachments = await tx.messageAttachment.deleteMany();
    const reads = await tx.conversationRead.deleteMany();
    const documents = await tx.officeDocument.deleteMany();
    const messages = await tx.message.deleteMany();
    const triage = await tx.triageItem.deleteMany();
    const tickets = await tx.ticket.deleteMany();
    const conversations = await tx.conversation.deleteMany();
    const identities = await tx.contactIdentity.deleteMany();
    const contacts = await tx.contact.deleteMany();
    const condominiums = await tx.condominium.deleteMany();
    const audit = await tx.auditEvent.deleteMany();
    const demoChannels = await tx.channelConnection.deleteMany({
      where: { type: { in: [ChannelType.dev_mock, ChannelType.evolution_cloud] } },
    });
    const extraUsers = await tx.user.deleteMany({
      where: { email: { not: ADMIN_EMAIL } },
    });

    const baileys = await tx.channelConnection.findMany({
      where: { type: ChannelType.evolution_baileys },
      orderBy: { createdAt: "asc" },
    });
    const keepBaileys =
      baileys.find((row) => /escrit[oó]rio/i.test(row.label)) ?? baileys[0];
    const extraBaileys = keepBaileys
      ? await tx.channelConnection.deleteMany({
          where: {
            type: ChannelType.evolution_baileys,
            id: { not: keepBaileys.id },
          },
        })
      : { count: 0 };

    return {
      automationExecutions: automationExecutions.count,
      attachments: attachments.count,
      reads: reads.count,
      documents: documents.count,
      messages: messages.count,
      triage: triage.count,
      tickets: tickets.count,
      conversations: conversations.count,
      identities: identities.count,
      contacts: contacts.count,
      condominiums: condominiums.count,
      audit: audit.count,
      demoChannels: demoChannels.count,
      extraUsers: extraUsers.count,
      extraBaileys: extraBaileys.count,
    };
  });

  const uploadsRoot = path.join(process.cwd(), "uploads");
  await rm(uploadsRoot, { recursive: true, force: true });

  console.log("Reset operação ok:", {
    database: ALLOWED_DATABASE,
    keptAdmin: ADMIN_EMAIL,
    removedDemoStaff: DEMO_STAFF_EMAIL,
    ...result,
    uploadsCleared: true,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
