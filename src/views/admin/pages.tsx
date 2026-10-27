// Admin Panel pages (original app/admin/* rebuilt on server functions; same visual language as the dashboard).
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Globe, Briefcase, CheckCircle, AlertTriangle, Loader2, UserCheck, Activity } from "lucide-react";
import {
  getAdminOverview, listAdminUsers, setUserRole, getAdminFinance, adjustOrgCredits,
  getAdminRates, saveCreditRate, saveLinguistRate, savePackage, getAdminAudit,
} from "@/lib/admin.functions";

export const card = "bg-white rounded-2xl border border-gray-200";
export const fmtDate = (s: string) => new Date(s).toLocaleString();

export function Page({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{sub}</p>
      </div>
      {children}
    </div>
  );
}

export function Loading({ error }: { error?: unknown }) {
  if (error) return <div className={`${card} p-6 text-sm text-red-600`}>{error instanceof Error ? error.message : "Could not load data."}</div>;
  return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal" /></div>;
}

// ── Overview ────────────────────────────────────────────────────
export function AdminOverview() {
  const fn = useServerFn(getAdminOverview);
  const { data, error } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => fn() });
  return (
    <Page title="Admin Dashboard" sub="Platform overview and management">
      {!data ? <Loading error={error} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Users", value: data.stats.users, icon: Users },
              { label: "Organizations", value: data.stats.orgs, icon: Globe },
              { label: "Total Projects", value: data.stats.projects, icon: Briefcase },
              { label: "Completed Jobs", value: data.stats.completed, icon: CheckCircle },
              { label: "Linguists", value: data.stats.linguists, icon: UserCheck },
              { label: "All Jobs", value: data.stats.jobs, icon: Activity },
              { label: "Processing now", value: data.stats.processing, icon: Loader2 },
              { label: "Failed orders", value: data.stats.failed, icon: AlertTriangle },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className={`${card} p-5`}>
                <Icon className="w-5 h-5 text-teal mb-2" />
                <div className="text-3xl font-bold text-navy">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
          <div className={`${card} overflow-x-auto`}>
            <div className="px-5 py-4 border-b border-gray-100 font-semibold text-navy">Recent orders</div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">Project</th><th>Organization</th><th>Workflow</th><th>Words</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {data.recent.map((p: any) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-5 py-2 font-medium text-navy">{p.name}{p.status === "FAILED" && p.last_error ? <div className="text-xs text-red-600 font-normal">{String(p.last_error).slice(0, 120)}</div> : null}</td>
                    <td>{p.organization?.name ?? "—"}</td><td>{p.workflow_type}</td><td>{p.total_word_count}</td>
                    <td><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{p.status}</span></td>
                    <td className="text-gray-500">{fmtDate(p.created_at)}</td>
                  </tr>
                ))}
                {!data.recent.length && <tr><td colSpan={6} className="px-5 py-6 text-gray-500">No orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}

// ── Users / Linguists ───────────────────────────────────────────
export function AdminUsers({ only }: { only?: "LINGUIST" }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const fn = useServerFn(listAdminUsers);
  const setRole = useServerFn(setUserRole);
  const qc = useQueryClient();
  const key = ["admin", "users", search, only ?? ""];
  const { data, error } = useQuery({ queryKey: key, queryFn: () => fn({ data: { q: search, role: only } }) });
  const toggle = async (userId: string, role: "LINGUIST" | "ADMIN", grant: boolean) => {
    if (role === "ADMIN" && grant && !confirm("Give this user full administrator access?")) return;
    try { await setRole({ data: { userId, role, grant } }); toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["admin", "users"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not change the role."); }
  };
  return (
    <Page title={only ? "Linguists" : "Users"} sub={only ? "Everyone who can take translation jobs" : "All accounts, their organization and roles"}>
      <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <input aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        <button className="px-4 py-2 rounded-xl bg-navy text-white text-sm">Search</button>
      </form>
      {!data ? <Loading error={error} /> : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">User</th><th>Organization</th><th>Roles</th><th>Joined</th><th className="px-5">Access</th></tr></thead>
            <tbody>
              {data.users.map((u: any) => {
                const isL = u.roles.includes("LINGUIST"), isA = u.roles.includes("ADMIN");
                return (
                  <tr key={u.user_id} className="border-t border-gray-100">
                    <td className="px-5 py-2"><div className="font-medium text-navy">{u.name ?? "—"}</div><div className="text-xs text-gray-500">{u.email}</div></td>
                    <td>{u.organization?.name ?? "—"}</td>
                    <td>{u.roles.length ? u.roles.join(", ") : "CLIENT"}</td>
                    <td className="text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-2 whitespace-nowrap space-x-2">
                      <button onClick={() => toggle(u.user_id, "LINGUIST", !isL)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">{isL ? "Remove linguist" : "Make linguist"}</button>
                      {u.user_id !== data.me && <button onClick={() => toggle(u.user_id, "ADMIN", !isA)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">{isA ? "Remove admin" : "Make admin"}</button>}
                    </td>
                  </tr>
                );
              })}
              {!data.users.length && <tr><td colSpan={5} className="px-5 py-6 text-gray-500">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

// ── Finance ─────────────────────────────────────────────────────
export function AdminFinance() {
  const fn = useServerFn(getAdminFinance);
  const adjust = useServerFn(adjustOrgCredits);
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["admin", "finance"], queryFn: () => fn() });
  const [form, setForm] = useState({ orgId: "", amount: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const orgName = (id: string) => data?.orgs.find((o: any) => o.id === id)?.name ?? id.slice(0, 8);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await adjust({ data: { orgId: form.orgId, amount: Number(form.amount), reason: form.reason } });
      toast.success(`Done. New balance: ${r.balance.toLocaleString()} credits`);
      setForm({ orgId: form.orgId, amount: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["admin", "finance"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not adjust credits."); }
    setBusy(false);
  };
  return (
    <Page title="Finance" sub="Credit balances, transactions and linguist payouts">
      {!data ? <Loading error={error} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[["Credits in client balances", data.totals.balance], ["Credits used*", Math.abs(data.totals.usage)], ["Credits refunded*", data.totals.refunds], ["Admin adjustments*", data.totals.adjustments]].map(([l, v]) => (
              <div key={l as string} className={`${card} p-5`}><div className="text-2xl font-bold text-navy">{Number(v).toLocaleString()}</div><div className="text-xs text-gray-500">{l}</div></div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-6">* {data.windowNote} Linguist pay owed (completed jobs): ${data.payouts.owed.toFixed(2)} · committed on active jobs: ${data.payouts.committed.toFixed(2)}</p>
          <form onSubmit={submit} className={`${card} p-5 mb-6 grid md:grid-cols-4 gap-3 items-end`}>
            <label className="text-xs text-gray-600">Organization
              <select required value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Choose…</option>
                {data.orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name} ({Number(o.credit_balance).toLocaleString()})</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600">Credits (+ add, − remove)
              <input required type="number" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-600">Reason (saved in history)
              <input required maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <button disabled={busy} className="px-4 py-2 rounded-xl bg-navy text-white text-sm disabled:opacity-50">{busy ? "Saving…" : "Adjust credits"}</button>
          </form>
          <div className={`${card} overflow-x-auto`}>
            <div className="px-5 py-4 border-b border-gray-100 font-semibold text-navy">Latest transactions</div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">Date</th><th>Organization</th><th>Type</th><th>Credits</th><th>Description</th></tr></thead>
              <tbody>
                {data.transactions.map((t: any) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-5 py-2 text-gray-500 whitespace-nowrap">{fmtDate(t.created_at)}</td><td>{orgName(t.organization_id)}</td><td>{t.type}</td>
                    <td className={Number(t.amount) < 0 ? "text-red-600" : "text-green-700"}>{Number(t.amount).toLocaleString()}</td><td className="text-gray-600">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}

// ── Rates & packages ────────────────────────────────────────────
export function AdminRates({ focus }: { focus: "credit" | "packages" | "linguist" }) {
  const fn = useServerFn(getAdminRates);
  const saveC = useServerFn(saveCreditRate);
  const saveL = useServerFn(saveLinguistRate);
  const saveP = useServerFn(savePackage);
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["admin", "rates"], queryFn: () => fn() });
  const run = async (p: Promise<unknown>) => {
    try { await p; toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin", "rates"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save."); }
  };
  const titles = { credit: ["Credit Rates", "Credits charged per word for each workflow"], packages: ["Credit Packages", "Packages clients can buy"], linguist: ["Reviewer Rates", "What linguists earn per word. Pay is fixed when a linguist accepts a job."] } as const;
  return (
    <Page title={titles[focus][0]} sub={titles[focus][1]}>
      {!data ? <Loading error={error} /> : (
        <div className={`${card} overflow-x-auto`}>
          {focus === "credit" && (
            <table className="w-full text-sm"><thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">Workflow</th><th>Credits / word</th><th /></tr></thead><tbody>
              {data.credit.map((r: any) => <RateRow key={r.id} label={r.label ?? r.workflow_type} fields={[["Credits / word", r.credits_per_word]]} onSave={([v]) => run(saveC({ data: { id: r.id, creditsPerWord: v } }))} />)}
            </tbody></table>
          )}
          {focus === "linguist" && (
            <table className="w-full text-sm"><thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">Workflow</th><th>USD / word</th><th>Minimum per job (USD)</th><th /></tr></thead><tbody>
              {data.linguist.map((r: any) => <RateRow key={r.id} label={r.label ?? r.workflow_type} fields={[["USD / word", r.rate_per_word], ["Minimum", r.min_payout]]} onSave={([a, b]) => run(saveL({ data: { id: r.id, ratePerWord: a, minPayout: b } }))} />)}
            </tbody></table>
          )}
          {focus === "packages" && <Packages packages={data.packages} onSave={(p) => run(saveP({ data: p }))} />}
        </div>
      )}
    </Page>
  );
}

function RateRow({ label, fields, onSave }: { label: string; fields: [string, number][]; onSave: (v: number[]) => void }) {
  const [vals, setVals] = useState(fields.map(([, v]) => String(v ?? 0)));
  return (
    <tr className="border-t border-gray-100">
      <td className="px-5 py-2 font-medium text-navy">{label}</td>
      {fields.map(([name], i) => (
        <td key={name}><input aria-label={`${label} ${name}`} type="number" min="0" step="0.0001" value={vals[i]} onChange={(e) => setVals(vals.map((x, j) => (j === i ? e.target.value : x)))} className="w-32 border border-gray-200 rounded-lg px-2 py-1" /></td>
      ))}
      <td className="px-5"><button onClick={() => onSave(vals.map(Number))} className="text-xs px-3 py-1 rounded-lg bg-navy text-white">Save</button></td>
    </tr>
  );
}

function Packages({ packages, onSave }: { packages: any[]; onSave: (p: any) => void }) {
  const blank = { id: null, name: "", credits: 0, bonusCredits: 0, priceUsd: 0, isActive: true, isPopular: false, displayOrder: packages.length };
  const [edit, setEdit] = useState<any>(null);
  return (
    <div>
      <table className="w-full text-sm"><thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">Package</th><th>Credits</th><th>Bonus</th><th>Price (USD)</th><th>Active</th><th /></tr></thead><tbody>
        {packages.map((p) => (
          <tr key={p.id} className="border-t border-gray-100">
            <td className="px-5 py-2 font-medium text-navy">{p.name}{p.is_popular ? " ★" : ""}</td><td>{Number(p.credits).toLocaleString()}</td><td>{Number(p.bonus_credits).toLocaleString()}</td><td>${Number(p.price_usd).toFixed(2)}</td><td>{p.is_active ? "Yes" : "No"}</td>
            <td className="px-5"><button className="text-xs px-3 py-1 rounded-lg border border-gray-200" onClick={() => setEdit({ id: p.id, name: p.name, credits: p.credits, bonusCredits: p.bonus_credits, priceUsd: p.price_usd, isActive: p.is_active, isPopular: p.is_popular, displayOrder: p.display_order })}>Edit</button></td>
          </tr>
        ))}
      </tbody></table>
      <div className="p-5 border-t border-gray-100">
        {!edit ? <button onClick={() => setEdit(blank)} className="text-sm px-4 py-2 rounded-xl bg-navy text-white">Add package</button> : (
          <form onSubmit={(e) => { e.preventDefault(); onSave(edit); setEdit(null); }} className="grid md:grid-cols-6 gap-2 items-end text-xs text-gray-600">
            {([["name", "Name", "text"], ["credits", "Credits", "number"], ["bonusCredits", "Bonus", "number"], ["priceUsd", "Price USD", "number"]] as const).map(([k, l, t]) => (
              <label key={k}>{l}<input required={k !== "bonusCredits"} type={t} step="0.01" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: t === "number" ? Number(e.target.value) : e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1 text-sm" /></label>
            ))}
            <label className="flex gap-2 items-center"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active <input type="checkbox" checked={edit.isPopular} onChange={(e) => setEdit({ ...edit, isPopular: e.target.checked })} />Popular</label>
            <div className="flex gap-2"><button className="px-3 py-1.5 rounded-lg bg-navy text-white text-sm">Save</button><button type="button" onClick={() => setEdit(null)} className="px-3 py-1.5 rounded-lg border text-sm">Cancel</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Audit log ───────────────────────────────────────────────────
export function AdminAudit() {
  const fn = useServerFn(getAdminAudit);
  const { data, error } = useQuery({ queryKey: ["admin", "audit"], queryFn: () => fn() });
  return (
    <Page title="Admin Activity" sub="Every credit adjustment, role change and rate change">
      {!data ? <Loading error={error} /> : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm"><thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">When</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>
            {data.rows.map((r: any) => (
              <tr key={r.id} className="border-t border-gray-100"><td className="px-5 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td><td>{r.action}</td><td className="font-mono text-xs">{r.target}</td><td className="text-xs text-gray-600">{JSON.stringify(r.details)}</td></tr>
            ))}
            {!data.rows.length && <tr><td colSpan={4} className="px-5 py-6 text-gray-500">No admin activity yet.</td></tr>}
          </tbody></table>
        </div>
      )}
    </Page>
  );
}

export function AdminComingSoon({ area }: { area: string }) {
  return (
    <Page title={area} sub="Not available yet">
      <div className={`${card} p-6 text-sm text-gray-600`}>This admin section has not been built yet. Users, finance, rates, packages and the activity log are available from the menu.</div>
    </Page>
  );
}
