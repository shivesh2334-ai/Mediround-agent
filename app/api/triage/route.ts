import { authed } from "@/lib/auth";
import { triage } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!authed(req)) return new Response("Unauthorized", { status: 401 });
  const { patient, notes, qa = [], round = 0 } = await req.json();
  try {
    return Response.json(await triage(patient, notes, qa, round));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
