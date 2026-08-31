import { prisma } from "./db";
import { env } from "./env";

export async function seedAdmin(): Promise<void> {
  await prisma.user.upsert({
    where: { email: env.SEED_ADMIN_EMAIL },
    update: {},
    create: { email: env.SEED_ADMIN_EMAIL, role: "admin", status: "invited" },
  });
}
