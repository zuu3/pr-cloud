import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

test.beforeAll(async () => {
  await prisma.user.upsert({
    where: { email: "e2e@school.ac.kr" },
    update: { status: "active" },
    create: { email: "e2e@school.ac.kr", role: "admin", status: "active" },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto("/api/auth/signin");
  await page.getByLabel("Email").fill("e2e@school.ac.kr");
  await page.getByRole("button", { name: /sign in with e2e/i }).click();
  await page.waitForURL("**/");
}

test("upload a small video, see it listed, play it, share it", async ({ page, context }) => {
  await login(page);

  await page.goto("/upload");
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/tiny.mp4");
  await page.getByRole("button", { name: /upload/i }).click();
  await expect(page.getByText(/complete|완료|100%/i)).toBeVisible({ timeout: 60_000 });

  await page.goto("/");
  const card = page.getByRole("link", { name: /tiny/i }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();

  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect
    .poll(async () => (await video.getAttribute("src")) ?? "", { timeout: 15_000 })
    .toContain("X-Amz-Signature");

  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  const shareUrl = await page.getByLabel("공유 링크").inputValue();
  expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{22}$/);

  await context.clearCookies();
  await page.goto(new URL(shareUrl).pathname);
  await expect(page.locator("video")).toBeVisible();
});
