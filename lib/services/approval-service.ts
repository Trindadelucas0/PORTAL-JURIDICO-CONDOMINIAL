import type { PrismaClient, User } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { resendFailedMessage } from "@/lib/services/whatsapp-dispatch";

export function createApprovalService(db: PrismaClient = defaultPrisma) {
  return {
    async approve(user: User, messageId: string) {
      return resendFailedMessage(db, user, messageId);
    },
  };
}

export const approvalService = createApprovalService();
