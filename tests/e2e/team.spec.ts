import { expect, test } from "@playwright/test";
import { login, seed } from "./support";

test("owner invites an agent who sets a password through the one-time link", async ({ page, browser }) => {
  const email = `invitee-${Date.now()}@test.local`;
  await login(page, seed().ownerEmail);
  await page.goto("/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#inv-name").fill("Ravi Invitee");
  await dialog.locator("#inv-email").fill(email);
  await dialog.locator("#inv-role").selectOption("agent");
  await dialog.getByRole("button", { name: "Create invitation" }).click();
  const linkInput = dialog.getByLabel("Invitation link");
  await expect(linkInput).toBeVisible();
  const firstLink = await linkInput.inputValue();
  expect(firstLink).toContain("/auth/confirm?token_hash=");

  // Inviting the same pending person again issues a fresh link instead of an error.
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Invite member" }).click();
  await dialog.locator("#inv-name").fill("Ravi Invitee");
  await dialog.locator("#inv-email").fill(email.toUpperCase());
  await dialog.locator("#inv-role").selectOption("agent");
  await dialog.getByRole("button", { name: "Create invitation" }).click();
  await expect(dialog.getByLabel("Invitation link")).toBeVisible();
  const link = await dialog.getByLabel("Invitation link").inputValue();
  expect(link).toContain("type=recovery");
  expect(link).not.toBe(firstLink);

  // The invitee opens the link in a fresh browser session.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  const u = new URL(link);
  await p2.goto(new URL(u.pathname + u.search, page.url()).toString());
  await expect(p2).toHaveURL(/\/reset-password/);
  await p2.locator("#password").fill("NewPassw0rd-123");
  await p2.locator("#confirm").fill("NewPassw0rd-123");
  await p2.getByRole("button", { name: "Set password" }).click();
  await expect(p2).toHaveURL(/\/dashboard/);
  // Session cookies are not readable by page scripts.
  const authCookies = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((c) => c.httpOnly && c.sameSite === "Lax")).toBe(true);
  expect(await p2.evaluate(() => document.cookie.includes("sb-"))).toBe(false);
  // New agent has no payments access.
  await p2.goto("/payments");
  await expect(p2).toHaveURL(/\/forbidden/);
  await ctx.close();
});

test("inviting someone who belongs to another agency is refused and leaves their account untouched", async ({ page, browser }) => {
  const s = seed();
  await login(page, s.ownerEmail);
  await page.goto("/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#inv-name").fill("Someone Else");
  await dialog.locator("#inv-email").fill(s.otherAgencyOwnerEmail);
  await dialog.locator("#inv-role").selectOption("agent");
  await dialog.getByRole("button", { name: "Create invitation" }).click();
  await expect(dialog.getByText("Already registered.")).toBeVisible();
  await expect(dialog.getByLabel("Invitation link")).toHaveCount(0);

  const ctx = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const p2 = await ctx.newPage();
  await login(p2, s.otherAgencyOwnerEmail);
  await p2.goto("/customers");
  await expect(p2.getByText("Foreign Customer").first()).toBeVisible();
  await ctx.close();
});
