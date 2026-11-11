import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigin = (() => { try { return supabaseUrl ? new URL(supabaseUrl).origin : ""; } catch { return ""; } })();
const isDev = process.env.NODE_ENV !== "production";

// Next.js inlines small bootstrap scripts, so script-src needs 'unsafe-inline' unless a nonce-based
// middleware is added. Everything else is locked to this origin (plus Supabase for any browser calls).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}` : ""}${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The app renders no next/image components; disabling the optimizer removes the /_next/image endpoint
  // (and its image-processing dependency) from the attack surface.
  images: { unoptimized: true },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit"],
  // PDF fonts are read from disk at runtime; make sure they are bundled with the serverless functions.
  outputFileTracingIncludes: {
    "/api/quotations/[id]/pdf": ["./assets/fonts/**/*"],
    "/api/itineraries/[id]/pdf": ["./assets/fonts/**/*"],
    "/api/payments/[id]/receipt": ["./assets/fonts/**/*"],
    "/quotations/[id]": ["./assets/fonts/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
