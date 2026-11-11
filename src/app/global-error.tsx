"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>TravelX is temporarily unavailable</h1>
          <p style={{ color: "#555" }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
