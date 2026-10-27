"use client";
import { useEffect, useState } from "react";
import Link from "@/compat/next-link";
import { ArrowLeft, CheckCircle2, Copy, Loader2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OcrRequestDetail({ id }: { id: string }) {
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ocr-requests/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Not found");
        const d = await res.json();
        setR(d);
        setText(d.verifiedText ?? d.extractedText ?? "");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function verify() {
    setSaving(true); setMsg(null);
    const res = await fetch(`/api/ocr-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifiedText: text }) });
    setSaving(false);
    if (res.ok) { setR(await res.json()); setMsg("Saved and marked as verified."); }
    else setMsg((await res.json().catch(() => ({}))).error ?? "Could not save.");
  }

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!r) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/dashboard/ocr-requests" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#33475B] mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to OCR Requests
      </Link>
      <h1 className="text-2xl font-semibold text-[#33475B] flex items-center gap-2 mb-1">
        <ScanText className="w-6 h-6 text-[#FF7A59]" /> {r.name || r.sourceFilename}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {r.pageCount} page{r.pageCount === 1 ? "" : "s"} · {r.wordCount} words · {r.sourceLanguage ?? "Unknown language"} · {r.creditsCharged} credits · Status: {r.status.replace(/_/g, " ").toLowerCase()}
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-[#33475B]">Extracted text — review and correct before using it</h2>
          <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(text)}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={20} className="w-full rounded-md border border-slate-200 p-3 text-sm font-mono" dir="auto" />
        <div className="flex items-center gap-3 mt-3">
          <Button onClick={verify} disabled={saving || !text.trim()} className="bg-[#FF7A59] hover:bg-[#ff6a45] text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />} Save & mark verified
          </Button>
          <Link href="/dashboard/wizard" className="text-sm text-[#0091AE] hover:underline">Start a translation order →</Link>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
