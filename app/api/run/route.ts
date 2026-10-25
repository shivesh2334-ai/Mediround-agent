import { authed } from "@/lib/auth";
import { runWorkflow, type RunInput } from "@/lib/workflow";

export const runtime = "nodejs";
export const maxDuration = 300;
export const preferredRegion = "bom1";

export async function POST(req: Request) {
  if (!authed(req)) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as RunInput;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const emit = (e: object) => c.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try { await runWorkflow(body, emit); } catch (e) { emit({ type: "error", text: (e as Error).message }); }
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
