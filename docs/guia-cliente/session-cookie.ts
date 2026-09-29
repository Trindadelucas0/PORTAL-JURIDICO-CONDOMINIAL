import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "../../lib/db/prisma";
import { createSession } from "../../lib/auth/session";

async function main() {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  if (rows[0]?.current_database !== "PORTAL-JURIDICO-GUIA") {
    throw new Error("Abortado: sessao so no banco de demonstracao.");
  }
  const user = await prisma.user.findFirst({
    where: { email: "admin@juricon.local", deletedAt: null, ativo: true },
  });
  if (!user) throw new Error("Admin de demonstracao nao encontrado.");
  const { token, expiresAt } = await createSession(user.id);
  const file = path.join(tmpdir(), "juricon-guia-cookies.txt");
  const expires = Math.floor(expiresAt.getTime() / 1000);
  const body = [
    "# Netscape HTTP Cookie File",
    `localhost\tFALSE\t/\tFALSE\t${expires}\tjuricon_session\t${token}`,
    "",
  ].join("\n");
  writeFileSync(file, body, "utf8");
  console.log("COOKIE_OK");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "falha");
    await prisma.$disconnect();
    process.exit(1);
  });
