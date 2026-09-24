const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.condominium
  .findFirst({
    where: { nome: { contains: "exito", mode: "insensitive" } },
    select: { id: true, nome: true },
  })
  .then(async (r) => {
    console.log(JSON.stringify(r));
    await p.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await p.$disconnect();
    process.exit(1);
  });
