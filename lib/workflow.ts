import { BASE, byName } from "./catalogue";
import { openContext } from "./browser";
import { runTask } from "./browserAgent";
import { finalOpinion, type Opinion, type Patient, type QA } from "./claude";

export type RunInput = { patient: Patient; notes: string; qa: QA[]; primaryTool?: string };
export type Emit = (e: { type: string; [k: string]: unknown }) => void;

export async function runWorkflow({ patient, notes, qa, primaryTool }: RunInput, emit: Emit) {
  const { ctx, close } = await openContext();
  const page = await ctx.newPage();
  const step = (text: string) => emit({ type: "step", text });
  const fullNotes = `${notes}\n\nAdditional history:\n${qa.map((x) => `${x.q}: ${x.a}`).join("\n")}`.trim();
  const out: Record<string, string> = {};
  try {
    step("Registering patient on Mediround");
    await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
    const reg = await runTask(page, "Register this ONE patient using the registration form, submit it, and confirm the patient was added.", { name: patient.name, age: patient.age, sex: patient.sex }, 12, step);
    emit({ type: "result", stage: "register", ok: reg.success, text: reg.summary });

    step("Opening consult");
    await page.goto(`${BASE}/patients`, { waitUntil: "domcontentloaded" });
    const con = await runTask(page, `Open the consult page for patient "${patient.name}". Paste the clinical notes into the notes field and save. If an AI analysis button exists, click it, wait for the result, and return the AI output in extracted.`, { notes: fullNotes, setting: patient.setting }, 16, step);
    out.consult = con.extracted;
    emit({ type: "result", stage: "consult", ok: con.success, text: con.summary });

    const tool = byName(primaryTool);
    if (tool) {
      step(`Opening module: ${tool.name}`);
      await page.goto(tool.url, { waitUntil: "domcontentloaded" });
      const mod = await runTask(page, "Use this clinical tool for the patient: enter the data wherever it asks, progress to its result/recommendation, and return the resulting assessment or recommendation text in extracted.", { patient, notes: fullNotes }, 20, step);
      out.module = mod.extracted;
      emit({ type: "result", stage: "module", ok: mod.success, text: mod.summary, url: tool.url });
    }
    step("Preparing final opinion");
    const final: Opinion = await finalOpinion(patient, notes, qa, `${out.module ?? ""}\n${out.consult ?? ""}`);
    emit({ type: "final", data: final, toolOutput: out.module ?? "" });
  } finally {
    await close().catch(() => {});
  }
}
