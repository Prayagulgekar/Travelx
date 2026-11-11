import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, seed } from "./support";

async function inviteAndActivate(page: Page, browser: Browser, email: string, password: string) {
  await login(page, seed().ownerEmail);
  await page.goto("/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#inv-name").fill("Mira Account");
  await dialog.locator("#inv-email").fill(email);
  await dialog.locator("#inv-role").selectOption("agent");
  await dialog.getByRole("button", { name: "Create invitation" }).click();
  const link = await dialog.getByLabel("Invitation link").inputValue();
  await dialog.getByRole("button", { name: "Done" }).click();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  const u = new URL(link);
  await p2.goto(new URL(u.pathname + u.search, page.url()).toString());
  await expect(p2.getByRole("heading", { name: "Choose a password" })).toBeVisible();
  await p2.locator("#password").fill(password);
  await p2.locator("#confirm").fill(password);
  await p2.getByRole("button", { name: "Set password" }).click();
  await expect(p2).toHaveURL(/\/dashboard/);
  await ctx.close();
}

test("changing a password while signed in requires the current password", async ({ page, browser }) => {
  const email = `account-${Date.now()}@test.local`;
  await inviteAndActivate(page, browser, email, "FirstPassw0rd-1");

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.locator("#email").fill(email);
  await p.locator("#password").fill("FirstPassw0rd-1");
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p).toHaveURL(/\/dashboard/);

  await p.goto("/profile");
  await p.getByRole("link", { name: "Change password" }).click();
  await expect(p.getByRole("heading", { name: "Change password" })).toBeVisible();
  await expect(p.locator("#current_password")).toBeVisible();

  await p.locator("#current_password").fill("WrongPassw0rd-9");
  await p.locator("#password").fill("SecondPassw0rd-2");
  await p.locator("#confirm").fill("SecondPassw0rd-2");
  await p.getByRole("button", { name: "Change password" }).click();
  await expect(p.getByText("Incorrect password.")).toBeVisible();

  await p.locator("#current_password").fill("FirstPassw0rd-1");
  await p.getByRole("button", { name: "Change password" }).click();
  await expect(p).toHaveURL(/\/profile/);
  await ctx.close();

  // Old password no longer works, the new one does.
  const c3 = await browser.newContext();
  const p3 = await c3.newPage();
  await p3.goto("/login");
  await p3.locator("#email").fill(email);
  await p3.locator("#password").fill("FirstPassw0rd-1");
  await p3.getByRole("button", { name: "Sign in" }).click();
  await expect(p3.getByText("Incorrect email or password.")).toBeVisible();
  await p3.locator("#password").fill("SecondPassw0rd-2");
  await p3.getByRole("button", { name: "Sign in" }).click();
  await expect(p3).toHaveURL(/\/dashboard/);
  await c3.close();
});

test("a suspended member cannot sign in until reactivated", async ({ page, browser }) => {
  const email = `suspend-${Date.now()}@test.local`;
  await inviteAndActivate(page, browser, email, "SuspendPassw0rd-1");

  const row = page.getByRole("row").filter({ hasText: email });
  await row.locator("select[name=status]").selectOption("suspended");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Team member updated.")).toBeVisible();

  const tryLogin = async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.locator("#email").fill(email);
    await p.locator("#password").fill("SuspendPassw0rd-1");
    await p.getByRole("button", { name: "Sign in" }).click();
    return { ctx, p };
  };
  const blocked = await tryLogin();
  await expect(blocked.p.getByText("Incorrect email or password.")).toBeVisible();
  await blocked.ctx.close();

  await page.reload();
  const row2 = page.getByRole("row").filter({ hasText: email });
  await row2.locator("select[name=status]").selectOption("active");
  await row2.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Team member updated.")).toBeVisible();

  const ok = await tryLogin();
  await expect(ok.p).toHaveURL(/\/dashboard/);
  await ok.ctx.close();
});
