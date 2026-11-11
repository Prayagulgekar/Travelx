import { expect, test } from "@playwright/test";
import { confirm, isoDay, login, logout, seed } from "./support";

// The full business workflow from the spec, executed in the browser against a real backend.
test.describe.configure({ mode: "serial" });

test("agency workflow: customer → enquiry → quotation → booking → payment → reports", async ({ page }) => {
  const s = seed();
  const phone = `+91 9${Date.now().toString().slice(-9)}`;
  const name = `Meera Iyer ${Date.now().toString().slice(-5)}`;

  // 1. Owner logs in and sees the dashboard.
  await login(page, s.ownerEmail);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await logout(page);

  // 2. Agent creates a customer.
  await login(page, s.agentEmail);
  await page.goto("/customers/new");
  await page.locator("#full_name").fill(name);
  await page.locator("#phone").fill(phone);
  await page.locator("#email").fill("meera@example.com");
  await page.locator("#city").fill("Pune");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // 3. Agent creates an enquiry for that customer.
  await page.goto("/enquiries/new");
  await page.locator("#customer_id").fill(name.split(" ")[0]!);
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await page.locator("#destination").fill("Kerala");
  await page.locator("#source_location").fill("Pune");
  await page.locator("#departure_date").fill(isoDay(30));
  await page.locator("#return_date").fill(isoDay(33));
  await page.locator("#adults").fill("2");
  await page.locator("#budget").fill("30000");
  await page.getByRole("button", { name: "Create enquiry" }).click();
  await expect(page).toHaveURL(/\/enquiries\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/ENQ-\d{6}/).first()).toBeVisible();

  // 4. Agent prepares a quotation; the preview must match decimal-safe pricing.
  await page.getByRole("link", { name: "Prepare quotation" }).click();
  await expect(page).toHaveURL(/\/quotations\/new/);
  await page.locator("#title").fill("Kerala backwaters 3N");
  await page.locator('[id^="desc-"]').first().fill("Houseboat stay");
  await page.locator('[id^="qty-"]').first().fill("3");
  await page.locator('[id^="price-"]').first().fill("4500.50");
  await page.locator('[id^="tax-"]').first().fill("12");
  await page.getByRole("button", { name: "+ Transportation" }).click();
  await page.locator('[id^="desc-"]').nth(1).fill("Airport transfers");
  await page.locator('[id^="qty-"]').nth(1).fill("1");
  await page.locator('[id^="price-"]').nth(1).fill("8000");
  await page.locator('[id^="tax-"]').nth(1).fill("5");
  await page.locator("#discount_type").selectOption("fixed");
  await page.locator("#discount_value").fill("500");
  // 3 × 4500.50 = 13501.50 (+12% = 1620.18); 8000 (+5% = 400); subtotal 21501.50, tax 2020.18, less 500.
  await expect(page.getByTestId("preview-subtotal")).toContainText("21,501.50");
  await expect(page.getByTestId("preview-tax")).toContainText("2,020.18");
  await expect(page.getByTestId("preview-total")).toContainText("23,021.68");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/);
  // Totals shown after save come from the database, not the browser.
  await expect(page.getByText("23,021.68").first()).toBeVisible();
  const quotationUrl = page.url();
  await expect(page.getByText(/review this quotation before it can be sent/)).toBeVisible();
  await logout(page);

  // 5. Owner reviews, marks sent, and records the customer's acceptance.
  await login(page, s.ownerEmail);
  await page.goto(quotationUrl);
  await confirm(page, "quotation-reviewed", "Mark as reviewed");
  await confirm(page, "quotation-sent", "Mark as sent");
  await confirm(page, "quotation-accepted", "Mark as accepted");
  await expect(page.getByText("Accepted").first()).toBeVisible();

  // 6. Convert the accepted quotation into a booking.
  await confirm(page, "convert-booking", "Create booking");
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/BKG-\d{6}/).first()).toBeVisible();
  const bookingUrl = page.url();

  // 7. Record a part payment against the booking.
  await page.getByRole("link", { name: "Record payment" }).click();
  await expect(page).toHaveURL(/\/payments\/new\?booking=/);
  await page.locator("#amount").fill("10000");
  await page.locator("#method").selectOption("upi");
  await page.locator("#transaction_reference").fill("UPI-E2E-1");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/PAY-\d{6}/).first()).toBeVisible();
  const paymentUrl = page.url();

  // Overpayment is rejected by the server.
  await page.goto(`${bookingUrl.replace(/\/bookings\//, "/payments/new?booking=")}`);
  await page.locator("#amount").fill("999999");
  await page.locator("#method").selectOption("cash");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.locator("#amount-error")).toContainText(/exceeds the outstanding balance/);

  // 8. Update booking status.
  await page.goto(bookingUrl);
  await expect(page.getByText("13,021.68").first()).toBeVisible(); // outstanding = 23021.68 - 10000
  await confirm(page, "booking-confirmed", "Mark confirmed");
  await expect(page.getByTestId("booking-in_progress")).toBeVisible();

  // 9. Owner reviews reports, including financial sections.
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByText("Payment collection")).toBeVisible();
  await expect(page.getByText("Outstanding balances")).toBeVisible();
  const csv = await page.request.get("/api/reports/export?type=payments");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("UPI-E2E-1");

  // Owner records a partial refund on the payment (owner-only).
  await page.goto("/payments");
  await expect(page.getByRole("link", { name: /PAY-\d{6}/ }).first()).toBeVisible();
  await page.goto(paymentUrl);
  await page.getByTestId("record-refund").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#cf-amount").fill("1000");
  await dialog.locator("#cf-reason").fill("Changed transfer");
  await dialog.getByRole("button", { name: "Record refund" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Partially refunded/i).first()).toBeVisible();
  const receipt = await page.request.get(`/api/payments/${paymentUrl.split("/").pop()}/receipt`);
  expect(receipt.status()).toBe(200);

  // Itinerary for the booking.
  await page.goto(bookingUrl);
  await page.getByRole("link", { name: "Create itinerary" }).click();
  await expect(page.locator("#destination")).toHaveValue("Kerala");
  await page.getByRole("button", { name: "Create itinerary" }).click();
  await expect(page).toHaveURL(/\/itineraries\/[0-9a-f-]{36}$/);
  const itineraryUrl = page.url();
  const ipdf = await page.request.get(`/api/itineraries/${itineraryUrl.split("/").pop()}/pdf`);
  expect(ipdf.status()).toBe(200);

  // Every screen renders without hitting the error boundary.
  for (const url of ["/dashboard", "/customers", "/enquiries", "/quotations", "/bookings", "/payments", "/payments/new", "/itineraries",
    "/itineraries/new", "/reports", "/team", "/settings", "/profile", "/notifications", `/search?q=${encodeURIComponent(name)}`,
    quotationUrl, bookingUrl, paymentUrl, itineraryUrl]) {
    await page.goto(url);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText("This page could not be loaded")).toHaveCount(0);
  }
  await page.goto(`/search?q=${encodeURIComponent(name)}`);
  await expect(page.getByText(name).first()).toBeVisible();

  // 10. PDF endpoints return real PDFs.
  const qid = quotationUrl.split("/").pop();
  const pdf = await page.request.get(`/api/quotations/${qid}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
