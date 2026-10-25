import type { Page } from "playwright-core";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, MODEL } from "./claude";
import { ALLOWED_HOSTS } from "./catalogue";

// Tags every visible interactive element with data-ai=<index> and returns a compact snapshot.
const SNAP = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  document.querySelectorAll("[data-ai]").forEach((e) => e.removeAttribute("data-ai"));
  const els = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="tab"],[role="option"],[contenteditable="true"]')].filter(vis).slice(0, 80);
  const items = els.map((e, i) => {
    e.setAttribute("data-ai", String(i));
    const text = (e.innerText || e.getAttribute("aria-label") || e.placeholder || e.title || "").trim().slice(0, 60);
    const label = e.labels && e.labels[0] ? e.labels[0].innerText.trim().slice(0, 40) : "";
    return { i, tag: e.tagName.toLowerCase(), type: e.type || "", text, label, value: String(e.value || "").slice(0, 40), href: e.getAttribute("href") || "", options: e.tagName === "SELECT" ? [...e.options].map((o) => o.text).slice(0, 15) : undefined, checked: e.checked };
  });
  return { url: location.href, title: document.title, text: document.body.innerText.slice(0, 1800), items };
})()`;

const SYS = `You operate a web browser to complete one clinical-workflow goal. Each turn you see the current page (visible text plus numbered interactive elements) and must call exactly one tool.
Rules: use ONLY the values in DATA; never invent patient values; leave unknown fields blank; never delete, remove, discharge or log out; for dropdowns use the select tool; after submitting, confirm success on the page; when the goal is met or impossible call done. For extraction goals, copy the relevant result text into "extracted".`;

const tools: Anthropic.Tool[] = [
  { name: "click", description: "Click element by index", input_schema: { type: "object", properties: { i: { type: "number" } }, required: ["i"] } },
  { name: "fill", description: "Replace the text of an input/textarea by index", input_schema: { type: "object", properties: { i: { type: "number" }, text: { type: "string" } }, required: ["i", "text"] } },
  { name: "select", description: "Choose a dropdown option by its visible text", input_schema: { type: "object", properties: { i: { type: "number" }, option: { type: "string" } }, required: ["i", "option"] } },
  { name: "goto", description: "Navigate to an allowed URL", input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
  { name: "done", description: "Finish the task", input_schema: { type: "object", properties: { success: { type: "boolean" }, summary: { type: "string" }, extracted: { type: "string" } }, required: ["success", "summary"] } },
];

const DANGEROUS = /delete|remove|discharge|log ?out|sign ?out|clear all/i;
export type TaskResult = { success: boolean; summary: string; extracted: string };

export async function runTask(page: Page, goal: string, data: unknown, maxSteps: number, log: (s: string) => void): Promise<TaskResult> {
  const hist: string[] = [];
  for (let step = 1; step <= maxSteps; step++) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const snap = await page.evaluate(SNAP);
    const r = await claude.messages.create({
      model: MODEL, max_tokens: 600, system: SYS, tools, tool_choice: { type: "any" },
      messages: [{ role: "user", content: `GOAL: ${goal}\nDATA: ${JSON.stringify(data)}\nACTIONS SO FAR:\n${hist.slice(-14).join("\n") || "none"}\nPAGE: ${JSON.stringify(snap)}` }],
    });
    const tu = r.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!tu) continue;
    const a = tu.input as Record<string, any>;
    if (tu.name === "done") return { success: !!a.success, summary: String(a.summary ?? ""), extracted: String(a.extracted ?? "") };
    try {
      if (tu.name === "goto") {
        const u = new URL(String(a.url));
        if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error("host not allowed");
        await page.goto(u.href, { waitUntil: "domcontentloaded", timeout: 20000 });
      } else {
        const loc = page.locator(`[data-ai="${Number(a.i)}"]`);
        if (tu.name === "click") {
          const label = await loc.innerText({ timeout: 3000 }).catch(() => "");
          if (DANGEROUS.test(label)) throw new Error("blocked destructive action");
          await loc.click({ timeout: 5000 });
        } else if (tu.name === "fill") await loc.fill(String(a.text), { timeout: 5000 });
        else if (tu.name === "select") await loc.selectOption({ label: String(a.option) }, { timeout: 5000 });
      }
      hist.push(`${step}. ${tu.name} ${JSON.stringify(a)}`);
      log(`${tu.name} ${a.text ? "“" + String(a.text).slice(0, 40) + "”" : a.option ?? a.url ?? "#" + a.i}`);
    } catch (e) {
      hist.push(`${step}. ${tu.name} ${JSON.stringify(a)} FAILED: ${(e as Error).message.slice(0, 100)}`);
    }
    await page.waitForTimeout(600);
  }
  const extracted = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => "");
  return { success: false, summary: "Step limit reached", extracted };
}
