import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { peerAvatarPublicUrl } from "@/lib/phone/avatar-url";
import {
  evolutionPeerHint,
  fetchEvolutionProfilePictureUrl,
  resolvePhoneForLidPeer,
  resolvePhoneFromContacts,
  type EvolutionPeerHint,
} from "@/lib/channels/evolution-peer-profile";
import { fetchEvolutionChatRows, fetchEvolutionContacts } from "@/lib/channels/evolution-lid-map";
import { isLidPeer, uniquePhones } from "@/lib/phone/identity";
import { mergeConversations } from "@/lib/services/conversation-merge";
import { findContactByPhones, upsertContactIdentities } from "@/lib/services/contact-identity";
import { isInOperationalFlow } from "@/lib/services/operational-flow";
import { Prisma as PrismaNs } from "@prisma/client";

export { peerAvatarPublicUrl };

const ROOT = path.join(process.cwd(), "uploads");
const MAX_AVATAR_BYTES = 512 * 1024;
const AVATAR_TTL_MS = 24 * 60 * 60 * 1000;

function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  const head = buffer.subarray(0, 64).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("<!doctype") || head.includes("<html")) return null;
  return null;
}

function isSafeRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.startsWith("169.254.")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function promoteLidPeerToPhone(
  db: PrismaClient,
  conversationId: string,
  connectionId: string,
  currentPeer: string,
  phone: string,
): Promise<string> {
  if (!isLidPeer(currentPeer) || isLidPeer(phone)) return conversationId;
  const source = await db.conversation.findFirst({ where: { id: conversationId } });
  const peerLid = source?.peerLid || currentPeer;
  try {
    await db.conversation.update({
      where: { id: conversationId },
      data: { peerPhoneE164: phone, peerLid },
    });
    return conversationId;
  } catch (error) {
    if (error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002") {
      const other = await db.conversation.findFirst({
        where: { connectionId, peerPhoneE164: phone },
      });
      if (other && other.id !== conversationId) {
        if (peerLid && !other.peerLid) {
          await db.conversation.update({ where: { id: other.id }, data: { peerLid } });
        }
        await mergeConversations(db, other.id, conversationId);
        return other.id;
      }
    } else {
      throw error;
    }
  }
  return conversationId;
}

function sanitizePeerDisplayName(value?: string | null): string | null {
  const text = value?.trim().replace(/\s+/g, " ");
  if (!text || text.length < 2 || text.length > 80) return null;
  if (/^\+?\d[\d\s()-]{6,}$/.test(text)) return null;
  return text;
}

async function relinkSavedContact(
  db: PrismaClient,
  conversationId: string,
  phone: string,
  lid: string | null,
) {
  if (!phone || isLidPeer(phone)) return;
  const contact = await findContactByPhones(db, uniquePhones(phone, lid));
  if (!contact) return;
  await upsertContactIdentities(db, contact.id, uniquePhones(phone, lid, contact.phoneE164));
  await db.conversation.update({
    where: { id: conversationId },
    data: {
      contactId: contact.id,
      condominiumId: contact.condominiumId,
      unidentified: false,
    },
  });
  if (!isInOperationalFlow(contact)) return;
  const triage = await db.triageItem.findUnique({ where: { conversationId } });
  if (!triage) {
    await db.triageItem.create({ data: { conversationId, status: "aberto" } });
  } else if (triage.status === "arquivado") {
    await db.triageItem.update({ where: { id: triage.id }, data: { status: "aberto" } });
  }
}

async function downloadAvatarToDisk(conversationId: string, remoteUrl: string): Promise<string | null> {
  if (!isSafeRemoteUrl(remoteUrl)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(remoteUrl, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) return null;
    const mime = detectImageMime(buf);
    if (!mime) return null;
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const storageKey = `avatars/${conversationId}.${ext}`;
    const full = path.join(ROOT, storageKey);
    const resolvedRoot = path.resolve(ROOT);
    const resolvedFile = path.resolve(full);
    if (!resolvedFile.startsWith(resolvedRoot + path.sep)) return null;
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
    return storageKey;
  } catch {
    return null;
  }
}

export type EnrichPeerOptions = {
  /**
   * Cascata findChats → findMessages → findContacts (só no enrich-peer / Puxar).
   * Inbound continua raso (nome, foto e par único de pushName).
   */
  deep?: boolean;
  /** Mensagem que disparou o enrich (ou última inbound no Puxar). */
  waMessageId?: string;
  /** Baixa a foto mesmo dentro do TTL. O ingest só liga isso quando ainda não há avatar. */
  forceAvatar?: boolean;
  /**
   * Teste: substitui a busca de PN na Evolution.
   * Produção não passa. Cadastro Juricon continua valendo antes deste retorno.
   */
  resolvePhone?: (lidPlaceholder: string, pushName: string | null) => Promise<string | null> | string | null;
};

const emptyHint: EvolutionPeerHint = { jid: null, pushName: null, profilePicUrl: null };

function avatarIsFresh(row: { peerAvatarKey: string | null; peerAvatarFetchedAt: Date | null }, forceAvatar?: boolean) {
  if (forceAvatar || !row.peerAvatarKey || !row.peerAvatarFetchedAt) return false;
  return Date.now() - row.peerAvatarFetchedAt.getTime() <= AVATAR_TTL_MS;
}

/**
 * Nome e foto do Contact da Evolution.
 * Celular: cadastro, JID de telefone, par único de pushName; com `deep` também
 * cascata findChats → findMessages → findContacts.
 * Não cria Contact. Não marca fetchedAt se a foto falhar.
 */
export async function enrichConversationPeerProfile(
  conversationId: string,
  db: PrismaClient = defaultPrisma,
  opts?: EnrichPeerOptions,
): Promise<{ conversationId: string; peerPhoneE164?: string; peerAvatarKey?: string | null }> {
  const row = await db.conversation.findFirst({ where: { id: conversationId } });
  if (!row) return { conversationId };

  let id = row.id;
  let peer = row.peerPhoneE164;
  const lid = row.peerLid || (isLidPeer(peer) ? peer : null);
  if (lid && !row.peerLid) {
    await db.conversation.update({ where: { id }, data: { peerLid: lid } });
  }

  let phone: string | null = null;
  if (isLidPeer(peer)) {
    const saved = await findContactByPhones(db, uniquePhones(lid));
    if (saved && !isLidPeer(saved.phoneE164)) phone = saved.phoneE164;
    if (!phone && opts?.resolvePhone) {
      const injected = await opts.resolvePhone(peer, row.peerDisplayName ?? null);
      if (injected && !isLidPeer(injected)) phone = injected;
    }
    if (!phone && opts?.deep) {
      const resolved = await resolvePhoneForLidPeer(peer, {
        deep: true,
        waMessageId: opts.waMessageId,
        pushName: row.peerDisplayName,
      });
      if (resolved && !isLidPeer(resolved)) phone = resolved;
    }
  }

  const fresh = avatarIsFresh(row, opts?.forceAvatar);
  const needEvolution = !opts?.resolvePhone && ((isLidPeer(peer) && !phone) || !row.peerDisplayName || !fresh);
  let hint = emptyHint;
  if (needEvolution) {
    const [contacts, chats] = await Promise.all([fetchEvolutionContacts(), fetchEvolutionChatRows()]);
    hint = evolutionPeerHint(peer, contacts ?? [], chats ?? []);
    if (isLidPeer(peer) && !phone && contacts) {
      const name = row.peerDisplayName?.trim() || hint.pushName || "";
      if (name) phone = resolvePhoneFromContacts(contacts, name);
    }
  }

  if (phone && isLidPeer(peer)) {
    id = await promoteLidPeerToPhone(db, id, row.connectionId, peer, phone);
    peer = phone;
  }
  if (phone && !isLidPeer(phone)) {
    await relinkSavedContact(db, id, phone, lid);
  } else if (!isLidPeer(peer)) {
    await relinkSavedContact(db, id, peer, lid);
  }

  const current = await db.conversation.findFirst({ where: { id } });
  if (!current) return { conversationId: id, peerPhoneE164: peer };

  const displayName = sanitizePeerDisplayName(hint.pushName);
  if (!current.peerDisplayName && displayName) {
    await db.conversation.update({ where: { id }, data: { peerDisplayName: displayName } });
  }

  if (avatarIsFresh(current, opts?.forceAvatar)) {
    return {
      conversationId: id,
      peerPhoneE164: current.peerPhoneE164,
      peerAvatarKey: current.peerAvatarKey,
    };
  }

  let remoteUrl: string | null = hint.profilePicUrl;
  let key = remoteUrl ? await downloadAvatarToDisk(id, remoteUrl) : null;
  if (!key && hint.jid) {
    remoteUrl = await fetchEvolutionProfilePictureUrl(hint.jid);
    key = remoteUrl ? await downloadAvatarToDisk(id, remoteUrl) : null;
  }
  if (!key) {
    return {
      conversationId: id,
      peerPhoneE164: current.peerPhoneE164,
      peerAvatarKey: current.peerAvatarKey,
    };
  }

  await db.conversation.update({
    where: { id },
    data: { peerAvatarKey: key, peerAvatarFetchedAt: new Date() },
  });
  if (current.contactId) {
    await db.contact.update({ where: { id: current.contactId }, data: { avatarKey: key } });
  }
  return { conversationId: id, peerPhoneE164: current.peerPhoneE164, peerAvatarKey: key };
}

const enrichInFlight = new Map<string, Promise<unknown>>();

export function enqueuePeerProfileEnrichment(
  conversationId: string,
  opts?: EnrichPeerOptions,
  db: PrismaClient = defaultPrisma,
) {
  const existing = enrichInFlight.get(conversationId);
  if (existing) return existing;
  const run = enrichConversationPeerProfile(conversationId, db, opts)
    .catch(() => undefined)
    .finally(() => {
      if (enrichInFlight.get(conversationId) === run) enrichInFlight.delete(conversationId);
    });
  enrichInFlight.set(conversationId, run);
  return run;
}

export function schedulePeerProfileEnrichment(conversationId: string, opts?: EnrichPeerOptions) {
  if (process.env.VITEST) return;
  void enqueuePeerProfileEnrichment(conversationId, opts);
}

export async function authorizeAvatarRead(
  user: { id: string; role: string },
  storageKey: string,
  db: PrismaClient = defaultPrisma,
): Promise<{ storageKey: string; mime: string; originalName: string } | null> {
  if (!storageKey.startsWith("avatars/") || storageKey.includes("..")) return null;
  const conv = await db.conversation.findFirst({
    where: { peerAvatarKey: storageKey },
    include: { tickets: { select: { assignedToId: true } } },
  });
  if (conv) {
    if (user.role !== "admin") {
      const mine = conv.tickets.some((t) => t.assignedToId === user.id);
      if (!mine) return null;
    }
    const ext = storageKey.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { storageKey, mime, originalName: `avatar.${ext || "jpg"}` };
  }
  const contact = await db.contact.findFirst({ where: { avatarKey: storageKey, deletedAt: null } });
  if (!contact) return null;
  if (user.role !== "admin") {
    const ticket = await db.ticket.findFirst({
      where: { contactId: contact.id, assignedToId: user.id },
      select: { id: true },
    });
    if (!ticket) return null;
  }
  const ext = storageKey.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { storageKey, mime, originalName: `avatar.${ext || "jpg"}` };
}
