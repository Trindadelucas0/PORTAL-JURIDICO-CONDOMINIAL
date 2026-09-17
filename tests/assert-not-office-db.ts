import type { PrismaClient } from "@prisma/client";

export const OFFICE_DATABASE = "PORTAL-JURIDICO";

export async function assertNotOfficeDatabase(db: PrismaClient) {
  const rows = await db.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  const name = rows[0]?.current_database;
  if (name === OFFICE_DATABASE) {
    throw new Error(
      `Testes de integração recusam o banco "${OFFICE_DATABASE}". Aponte DATABASE_URL para outro database (ex. PORTAL-JURIDICO-TEST).`,
    );
  }
}
