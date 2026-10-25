# Mediround Agent (Playwright + Next.js 14)

Flow: **/api/triage** (Claude picks the module, asks up to 2 rounds of follow-ups) → **/api/run** (headless Chromium via Playwright: registers the patient, opens the consult, saves notes, runs the routed module, extracts its output) → Claude writes the final opinion. Progress streams to the UI as NDJSON.

The browser loop is selector-free: each step Claude sees the page text plus numbered interactive elements and calls click/fill/select/goto/done, so UI changes on mediround.in shouldn't break it. Navigation is limited to mediround.in and the catalogued tool hosts; destructive clicks (delete/remove/discharge/logout) are blocked.

## Deploy
1. `npm i`, copy `.env.example` to `.env.local`, fill `ANTHROPIC_API_KEY` and `AGENT_API_KEY`.
2. `npm run dev` (set `CHROME_EXECUTABLE_PATH` to local Chrome; add `HEADED=1` to watch it work).
3. Push to GitHub, import in Vercel (region bom1 is set in vercel.json).

## Vercel notes
- `/api/run` needs Pro (300 s). On Hobby (60 s) set `BROWSER_WS_ENDPOINT` to a remote browser (Browserless/Browserbase) and lower the step caps in `lib/workflow.ts`.
- Chromium comes from `@sparticuz/chromium` (bundled via `outputFileTracingIncludes`). Keep playwright-core 1.49.x paired with chromium 131.x.
- If Mediround needs login, export a Playwright storageState JSON into `MEDIROUND_STORAGE_STATE`.

## Privacy
Patient data goes to the Anthropic API and into your Mediround workspace. Prefer initials or IDs and review DPDP obligations before real-patient use. Routes are protected by `x-agent-key`; add real auth before sharing widely.
