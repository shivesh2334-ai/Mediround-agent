import Anthropic from "@anthropic-ai/sdk";
import { listForPrompt } from "./catalogue";

export const claude = new Anthropic();
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export type Patient = { name: string; age: string; sex: string; setting: string; history?: string };
export type QA = { q: string; a: string };
export type Opinion = {
  stage: "ask" | "final"; primary_tool?: string; alt_tools?: string[]; why?: string; questions?: string[];
  red_flags?: string[]; differentials?: string[]; opinion?: string; next_steps?: string[];
};

const SYS = `You are a clinical navigation agent inside Mediround, a resident-doctor workspace used by Indian clinicians. Given a patient and consultation notes, pick the best Mediround tool from the catalogue, ask only the key missing clinical questions needed to use it, then give a concise opinion. Use exact tool names from the catalogue. Flag emergencies first. Return ONLY JSON: {"stage":"ask"|"final","primary_tool":"exact name","alt_tools":["exact name"],"why":"one line","questions":["max 4 short questions"],"red_flags":[],"differentials":[],"opinion":"3-5 sentence assessment","next_steps":[]}. Use stage "ask" only if essential data is missing and fewer than 2 question rounds have happened; otherwise "final". Catalogue:\n${listForPrompt()}`;

async function json(system: string, user: string): Promise<Opinion> {
  const r = await claude.messages.create({ model: MODEL, max_tokens: 1500, system, messages: [{ role: "user", content: user }] });
  const t = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Model returned no JSON");
  return JSON.parse(m[0]);
}

export const triage = (p: Patient, notes: string, qa: QA[], round: number) =>
  json(SYS, `PATIENT: ${JSON.stringify(p)}\nNOTES: ${notes}\nQ&A: ${JSON.stringify(qa)}\nQuestion rounds done: ${round}${round >= 2 ? "\nReturn stage final now." : ""}`);

export const finalOpinion = (p: Patient, notes: string, qa: QA[], toolOutput: string) =>
  json(SYS, `PATIENT: ${JSON.stringify(p)}\nNOTES: ${notes}\nQ&A: ${JSON.stringify(qa)}\nOUTPUT FROM MEDIROUND TOOL (verify; may be partial): ${toolOutput.slice(0, 4000)}\nReturn stage final now.`);
