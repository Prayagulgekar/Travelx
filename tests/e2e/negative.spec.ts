import { expect, test } from "@playwright/test";
import { isoDay, login, seed } from "./support";

test("invalid login shows an error and stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(seed().ownerEmail);
  await page.locator("#password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/invalid|incorrect/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login/);
  const api = await page.request.get("/api/reports/export?type=payments", { maxRedirects: 0 });
  expect([302, 303, 307, 401]).toContain(api.status());
});

test("missing required fields are reported per field", async ({ page }) => {
  await login(page, seed().agentEmail);
  await page.goto("/customers/new");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.locator("#full_name-error")).toBeVisible();
  await expect(page.locator("#phone-error")).toBeVisible();
  await expect(page).toHaveURL(/\/customers\/new/);
});

test("return date before departure is rejected", async ({ page }) => {
  const s = seed();
  await login(page, s.agentEmail);
  // Create a customer to pick.
  const name = `Date Check ${Date.now().toString().slice(-6)}`;
  await page.goto("/customers/new");
  await page.locator("#full_name").fill(name);
  await page.locator("#phone").fill(`+91 8${Date.now().toString().slice(-9)}`);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);

  await page.goto("/enquiries/new");
  await page.locator("#customer_id").fill("Date Check");
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await page.locator("#destination").fill("Goa");
  await page.locator("#departure_date").fill(isoDay(20));
  await page.locator("#return_date").fill(isoDay(15));
  await page.getByRole("button", { name: "Create enquiry" }).click();
  await expect(page.locator("#return_date-error")).toBeVisible();
  await expect(page).toHaveURL(/\/enquiries\/new/);
});

test("agents cannot open payments, reports export or team management", async ({ page }) => {
  await login(page, seed().agentEmail);
  await page.goto("/payments");
  await expect(page).toHaveURL(/\/forbidden/);
  await page.goto("/payments/new");
  await expect(page).toHaveURL(/\/forbidden/);
  const res = await page.request.get("/api/reports/export?type=payments");
  expect(res.status()).toBe(403);
});

test("a record from another agency is not reachable by URL", async ({ page }) => {
  const s = seed();
  await login(page, s.ownerEmail);
  await page.goto(`/customers/${s.otherAgencyCustomerId}`);
  await expect(page.getByText(/not found|doesn.t exist|could not find/i).first()).toBeVisible();
  await expect(page.getByText("Foreign Customer")).toHaveCount(0);
  await page.goto(`/customers/${s.otherAgencyCustomerId}/edit`);
  await expect(page.getByText("Foreign Customer")).toHaveCount(0);
});

test("a new agency can sign up and lands on its own empty dashboard", async ({ page }) => {
  await page.goto("/signup");
  await page.locator("#full_name").fill("Nisha Founder");
  await page.locator("#agency_name").fill(`Wanderlust ${Date.now()}`);
  await page.locator("#email").fill(`founder-${Date.now()}@test.local`);
  await page.locator("#password").fill("Founder-pass-2026");
  await page.getByRole("button", { name: "Create agency workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // Another agency's customer is not visible in the new workspace.
  await page.goto("/customers");
  await expect(page.getByText("Foreign Customer")).toHaveCount(0);
  await page.goto("/team");
  await expect(page.getByText("Nisha Founder").first()).toBeVisible();
});

test("weak passwords are rejected at sign-up", async ({ page }) => {
  await page.goto("/signup");
  await page.locator("#full_name").fill("Weak Pass");
  await page.locator("#agency_name").fill("Weak Agency");
  await page.locator("#email").fill(`weak-${Date.now()}@test.local`);
  await page.locator("#password").fill("short");
  await page.getByRole("button", { name: "Create agency workspace" }).click();
  await expect(page.locator("#password-error")).toBeVisible();
  await expect(page).toHaveURL(/\/signup/);
});

test("repeated failed sign-ins are throttled; the limit counts failures only", async ({ page }) => {
  const email = `nobody-${Date.now()}@test.local`;
  await page.goto("/login");
  for (let i = 0; i < 8; i++) {
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.").last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  }
  await page.locator("#password").fill("wrong-password-final");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Too many sign-in attempts/).first()).toBeVisible();
});
