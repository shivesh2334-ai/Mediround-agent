"use client";
import { useState } from "react";

type Op = { stage: string; primary_tool?: string; why?: string; questions?: string[]; red_flags?: string[]; differentials?: string[]; opinion?: string; next_steps?: string[] };
const inp = "w-full rounded-lg border border-slate-300 bg-white p-2 text-sm";
const btn = "rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export default function Home() {
  const [key, setKey] = useState("");
  const [p, setP] = useState({ name: "", age: "", sex: "Male", setting: "OPD", history: "" });
  const [notes, setNotes] = useState("");
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [qs, setQs] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const [route, setRoute] = useState<Op | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [final, setFinal] = useState<Op | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const H = { "Content-Type": "application/json", "x-agent-key": key };

  async function triage(nextQa: { q: string; a: string }[], r: number) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/triage", { method: "POST", headers: H, body: JSON.stringify({ patient: p, notes, qa: nextQa, round: r }) });
      if (!res.ok) throw new Error(res.status === 401 ? "Wrong agent key" : await res.text());
      const o: Op = await res.json();
      setRoute(o);
      if (o.stage === "ask" && r < 2 && o.questions?.length) { setQs(o.questions); setRound(r + 1); setBusy(false); return; }
      setQs([]); await run(nextQa, o.primary_tool);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  async function run(finalQa: { q: string; a: string }[], tool?: string) {
    setLog([]); setFinal(null);
    const res = await fetch("/api/run", { method: "POST", headers: H, body: JSON.stringify({ patient: p, notes, qa: finalQa, primaryTool: tool }) });
    if (!res.ok || !res.body) { setErr("Run failed: " + res.status); setBusy(false); return; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines.filter(Boolean)) {
        const e = JSON.parse(l);
        if (e.type === "step") setLog((x) => [...x, "• " + e.text]);
        if (e.type === "result") setLog((x) => [...x, `${e.ok ? "✓" : "⚠"} ${e.stage}: ${e.text}`]);
        if (e.type === "final") setFinal(e.data);
        if (e.type === "error") setErr(e.text);
      }
    }
    setBusy(false);
  }

  const start = () => { setQa([]); setRound(0); setFinal(null); triage([], 0); };
  const answer = () => {
    const merged = [...qa, ...qs.map((q, i) => ({ q, a: (document.getElementById("a" + i) as HTMLInputElement)?.value || "unknown" }))];
    setQa(merged); setQs([]); triage(merged, round);
  };
  const List = ({ h, a }: { h: string; a?: string[] }) => a?.length ? <div className="mt-2"><b>{h}</b><ul className="ml-5 list-disc">{a.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold">Mediround Agent</h1>
      <input className={inp} type="password" placeholder="Agent key" value={key} onChange={(e) => setKey(e.target.value)} />
      <section className="space-y-2 rounded-xl border bg-white p-3">
        <h2 className="text-sm font-semibold text-teal-700">1 · Admit patient</h2>
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          <input className={inp} placeholder="Age" inputMode="numeric" value={p.age} onChange={(e) => setP({ ...p, age: e.target.value })} />
          <select className={inp} value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value })}><option>Male</option><option>Female</option><option>Other</option></select>
          <select className={inp} value={p.setting} onChange={(e) => setP({ ...p, setting: e.target.value })}><option>OPD</option><option>Ward</option><option>Emergency</option><option>ICU</option></select>
        </div>
        <input className={inp} placeholder="Known conditions / medicines (optional)" value={p.history} onChange={(e) => setP({ ...p, history: e.target.value })} />
        <h2 className="pt-2 text-sm font-semibold text-teal-700">2 · Open consultation</h2>
        <textarea className={inp + " h-28"} placeholder="Complaint, vitals, exam, tests…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className={btn} disabled={busy || !key || !p.name || !notes} onClick={start}>Start agent</button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </section>
      {route && <section className="rounded-xl border bg-white p-3 text-sm"><b>Routed to:</b> {route.primary_tool ?? "—"}<div className="text-slate-500">{route.why}</div></section>}
      {qs.length > 0 && (
        <section className="space-y-2 rounded-xl border bg-white p-3 text-sm">
          {qs.map((q, i) => <label key={i} className="block">{q}<input id={"a" + i} className={inp + " mt-1"} /></label>)}
          <button className={btn} onClick={answer}>Submit answers</button>
        </section>
      )}
      {log.length > 0 && <section className="rounded-xl border bg-slate-900 p-3 font-mono text-xs text-slate-100">{log.map((l, i) => <div key={i}>{l}</div>)}</section>}
      {final && (
        <section className="rounded-xl border bg-white p-3 text-sm">
          <List h="⚠ Red flags" a={final.red_flags} />
          <p className="mt-2"><b>Assessment</b><br />{final.opinion}</p>
          <List h="Differentials" a={final.differentials} /><List h="Next steps" a={final.next_steps} />
          <p className="mt-3 text-xs text-slate-500">AI-generated suggestion. Verify against clinical findings and local protocols.</p>
        </section>
      )}
    </main>
  );
}
