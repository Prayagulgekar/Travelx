// Minimal stand-in for the Supabase API gateway: routes /auth/v1 to GoTrue and /rest/v1 to PostgREST.
import http from "node:http";
const port = Number(process.env.GATEWAY_PORT ?? 54321);
const targets = { "/auth/v1": Number(process.env.AUTH_PORT ?? 9999), "/rest/v1": Number(process.env.REST_PORT ?? 3001) };
http.createServer((req, res) => {
  const prefix = Object.keys(targets).find((p) => req.url?.startsWith(p));
  if (!prefix) { res.writeHead(404).end("not found"); return; }
  const upstream = http.request(
    { host: "127.0.0.1", port: targets[prefix], path: req.url.slice(prefix.length) || "/", method: req.method, headers: req.headers },
    (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); },
  );
  upstream.on("error", (e) => { res.writeHead(502).end(String(e)); });
  req.pipe(upstream);
}).listen(port, "127.0.0.1", () => console.log(`gateway on :${port}`));
