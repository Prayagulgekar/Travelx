import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TravelX", template: "%s · TravelX" },
  description: "Travel agency operations: enquiries, quotations, itineraries, bookings and payments.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#13234a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ ["--font-sans" as string]: "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial" }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
