import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { acceptedBooking, createCustomer, createEnquiry, signIn } from "../integration/helpers";
import { login, seed } from "./support";

// Layout and accessibility checks at phone, tablet and desktop sizes, on pages with real data.
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },   // iPhone 13/14
  { name: "tablet", width: 820, height: 1180 },  // iPad Air portrait
  { name: "desktop", width: 1440, height: 900 },
] as const;

let detail: { customer: string; enquiry: string; quotation: string; booking: string } = { customer: "", enquiry: "", quotation: "", booking: "" };

test.beforeAll(async () => {
  const s = seed();
  const owner = await signIn(s.ownerEmail);
  const c = await createCustomer(owner, { full_name: "Responsive Check Customer With A Rather Long Name", address: "Flat 1204, Sea Breeze Towers, Juhu Tara Road" });
  const e = await createEnquiry(owner, c.id, { destination: "Thiruvananthapuram and Kanyakumari" });
  const t = { owner, agent: owner } as unknown as Parameters<typeof acceptedBooking>[0];
  const { quotationId, bookingId } = await acceptedBooking(t, e.id, owner);
  detail = { customer: c.id, enquiry: e.id, quotation: quotationId, booking: bookingId };
});

async function noHorizontalOverflow(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `page is ${scroll - client}px wider than the viewport`).toBeLessThanOrEqual(client + 1);
}

for (const vp of VIEWPORTS) {
  test(`${vp.name} (${vp.width}x${vp.height}): pages fit the screen and navigation works`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/login");
    await noHorizontalOverflow(page);
    await login(page, seed().ownerEmail);

    const pages = ["/dashboard", "/customers", "/enquiries", "/quotations", "/bookings", "/payments", "/payments/new", "/itineraries", "/reports", "/team", "/settings",
      "/customers/new", "/enquiries/new", `/customers/${detail.customer}`, `/enquiries/${detail.enquiry}`, `/quotations/${detail.quotation}`,
      `/quotations/new?enquiry=${detail.enquiry}`, `/bookings/${detail.booking}`];
    for (const url of pages) {
      await page.goto(url);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await test.step(url, () => noHorizontalOverflow(page));
    }

    await page.goto("/dashboard");
    if (vp.width < 1024) {
      await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
      await page.getByRole("button", { name: "Open navigation" }).click();
      const nav = page.getByRole("dialog", { name: "Navigation" });
      await expect(nav).toBeVisible();
      await nav.getByRole("link", { name: "Bookings" }).click();
      await expect(page).toHaveURL(/\/bookings$/);
      await expect(nav).toBeHidden();
    } else {
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Bookings" }).click();
      await expect(page).toHaveURL(/\/bookings$/);
    }
  });
}

test("accessibility: no serious or critical axe violations on key screens", async ({ page }) => {
  const problems: string[] = [];
  const scan = async (label: string) => {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    problems.push(...report.map((r) => `${label}: ${r}`));
  };
  await page.goto("/login");
  await scan("/login");
  await page.goto("/signup");
  await scan("/signup");
  await login(page, seed().ownerEmail);
  for (const url of ["/dashboard", "/customers", "/customers/new", "/enquiries/new", `/enquiries/${detail.enquiry}`, `/quotations/new?enquiry=${detail.enquiry}`,
    `/quotations/${detail.quotation}`, `/bookings/${detail.booking}`, "/payments", "/payments/new", "/reports", "/team", "/settings"]) {
    await page.goto(url);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await scan(url);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await scan("mobile navigation");
  expect(problems, problems.join("\n")).toEqual([]);
});
