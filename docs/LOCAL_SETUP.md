# Run TravelX in VS Code (Windows or Mac)

TravelX needs a Supabase backend (database and login) to show its screens. You can do this in two stages:

- **Stage A: run the app with no backend (about 10 minutes).** This proves the code installs, builds and starts on your machine.
  The browser shows a "not configured" message, which is expected.
- **Stage B: connect a backend.** Use either a local Supabase in Docker (below) or a free hosted Supabase project ([DEPLOYMENT.md](DEPLOYMENT.md) §1).
  After that, sign-up, login and every screen work.

---

## 1. Install the tools (once)

| Tool | Where | Check it worked (in a terminal) |
|---|---|---|
| **Node.js 22 LTS** (20.9 or newer works) | https://nodejs.org → "LTS" installer | `node -v` shows `v22…` |
| **VS Code** | https://code.visualstudio.com | — |
| **Docker Desktop** (only for the local backend in Stage B) | https://www.docker.com/products/docker-desktop | `docker -v` |

On Windows, close and reopen VS Code after installing Node so the terminal can find it.

## 2. Open the project

1. Unzip `travelx.zip`. You get a folder called `travelx`. Put it somewhere simple, such as `Documents\travelx` or `~/Projects/travelx`.
2. In VS Code, use **File → Open Folder…** and pick the `travelx` folder (the one that contains `package.json`).
3. If VS Code asks whether you trust the authors, choose **Yes**.
4. Open a terminal with **Terminal → New Terminal**. It opens in the project folder.

## 3. Stage A: install and start

```bash
npm install
```

This takes 1–3 minutes and creates a `node_modules` folder. Warnings are fine; a red `ERR!` is not (see Troubleshooting).

Optional checks that need no backend:

```bash
npm run typecheck      # should finish with no errors
npm run test:unit      # should say: Tests 54 passed (54)
```

Start the app:

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. With no backend yet, you'll see exactly this:

> TravelX is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.

That means the app is running correctly; it just has no database to talk to. Stop it with **Ctrl + C** in the terminal.

## 4. Stage B (option 1): local Supabase with Docker

1. Start **Docker Desktop** and wait until it says it is running.
2. In the VS Code terminal (in the `travelx` folder), run:
   ```bash
   npx supabase start
   ```
   The first run downloads the Supabase images (a few GB, 5–15 minutes). It applies all the files in `supabase/migrations` automatically.
   When it finishes, it prints a table with **API URL**, **anon key** and **service_role key**.
   If your CLI version shows "Publishable key" and "Secret key" instead, run `npx supabase status -o env` and use `ANON_KEY` and `SERVICE_ROLE_KEY` from its output.
3. Create your env file from the template:
   - Windows (PowerShell): `copy .env.example .env.local`
   - Mac: `cp .env.example .env.local`
4. Open `.env.local` in VS Code and fill it in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from step 2>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key from step 2>
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   CRON_SECRET=any-random-text-at-least-32-characters-long
   ```
   Leave `RESEND_API_KEY` and `EMAIL_FROM` empty. The email button stays hidden, and you can download quotation PDFs instead.
5. Run `npm run dev` again and open **http://localhost:3000/signup**. Create your agency; you become the Owner.
   Email confirmation is off in the local config, so you're signed in straight away.
6. Useful extras:
   - Supabase Studio (browse the database): http://127.0.0.1:54323
   - Stop the backend: `npx supabase stop`. Start it again later with `npx supabase start`; your data is kept.

Note: this Docker path is the standard Supabase CLI workflow, but it could not be run in the environment where TravelX was built (no Docker there).
The same migrations were tested on the equivalent components (Postgres 16, Supabase Auth, PostgREST).

## 4. Stage B (option 2): hosted Supabase (no Docker)

Follow [DEPLOYMENT.md](DEPLOYMENT.md) §1 to create a free project and run `npx supabase db push`. Then put its URL and keys into `.env.local`
(same five lines as above, with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` while developing). In Supabase → Authentication → URL Configuration,
add `http://localhost:3000/auth/confirm` to the redirect URLs.

## Troubleshooting

| You see | Fix |
|---|---|
| `'npm' is not recognized` / `command not found: npm` | Node isn't installed, or VS Code was open during the install. Reinstall Node, then restart VS Code. |
| PowerShell: "running scripts is disabled on this system" | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or switch the terminal to Command Prompt (the dropdown next to **+** in the terminal panel). |
| `Port 3000 is in use` | Run `npm run dev -- -p 3001`, open http://localhost:3001, and set `NEXT_PUBLIC_SITE_URL=http://localhost:3001`. |
| "TravelX is not configured…" after creating `.env.local` | The file must be named exactly `.env.local` (not `.env.local.txt`) and sit next to `package.json`. Restart `npm run dev` after editing it. |
| `npx supabase start`: "Cannot connect to the Docker daemon" | Docker Desktop isn't running. Start it and retry. |
| Signing in says "Incorrect email or password" right after sign-up on hosted Supabase | Email confirmation is on there; click the link in the email first (see [EMAIL.md](EMAIL.md)). |
