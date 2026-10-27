import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

// Live progress for orders that are still being translated in the background.
export default function ProcessingBanner({ projectId, status }: { projectId: string; status: string }) {
  const [s, setS] = useState({ status, done: 0, total: 0, retrying: false });
  const active = s.status === "PENDING" || s.status === "PROCESSING";
  useEffect(() => {
    if (status !== "PENDING" && status !== "PROCESSING") return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/progress`);
        if (res.ok) {
          const d = await res.json();
          if (stop) return;
          setS(d);
          if (d.status !== "PENDING" && d.status !== "PROCESSING") { window.location.reload(); return; }
        }
      } catch { /* keep polling */ }
      if (!stop) setTimeout(tick, 4000);
    };
    tick();
    return () => { stop = true; };
  }, [projectId, status]);
  if (!active) return null;
  const pct = s.total ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
  return (
    <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#CBD6E2" }} data-testid="processing-banner">
      <div className="flex items-center gap-2 mb-3">
        {s.retrying ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#0091AE" }} />}
        <p className="text-sm font-semibold" style={{ color: "#33475B" }}>
          {s.retrying ? "A temporary problem occurred — retrying automatically" : "AI translation in progress"}
        </p>
        <span className="ml-auto text-xs font-semibold" style={{ color: "#516F90" }}>
          {s.total ? `${s.done.toLocaleString()} / ${s.total.toLocaleString()} segments · ${pct}%` : "Starting…"}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E8EEF4" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#0091AE" }} />
      </div>
      <p className="text-xs mt-2" style={{ color: "#99ACC2" }}>You can leave this page — translation continues in the background and you'll get a notification when it's done.</p>
    </section>
  );
}
