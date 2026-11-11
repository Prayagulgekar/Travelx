import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import type { E2ESeed } from "./global-setup";

export function seed(): E2ESeed {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../.localstack/e2e-seed.json"), "utf8")) as E2ESeed;
}

export async function login(page: Page, email: string, password = seed().password) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

export function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Opens a ConfirmAction dialog by its trigger test id and confirms it. */
export async function confirm(page: Page, testId: string, confirmLabel: string) {
  await page.getByTestId(testId).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(dialog).toBeHidden();
}
