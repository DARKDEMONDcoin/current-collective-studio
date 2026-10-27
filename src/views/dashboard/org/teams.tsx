"use client";
// Replaces the original server component: loads teams + org members via the API, then renders TeamsClient.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import TeamsClient from "./teams-client";

export default function TeamsPage() {
  const [data, setData] = useState<{ departments: any[]; users: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([fetch("/api/departments"), fetch("/api/org-members")])
      .then(async ([d, u]) => {
        if (!d.ok || !u.ok) throw new Error();
        const users = await u.json();
        setData({ departments: await d.json(), users: users.map((x: any) => ({ id: x.id, name: x.name, email: x.email, role: x.role })) });
      })
      .catch(() => setError("Could not load teams. Please refresh the page."));
  }, []);
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  const roleOf = new Map(data.users.map((u) => [u.id, u.role]));
  const deps = data.departments.map((d) => ({ ...d, members: d.members.map((m: any) => ({ ...m, user: { ...m.user, role: roleOf.get(m.userId) ?? m.user.role } })) }));
  return <TeamsClient initialDepartments={deps} orgUsers={data.users} />;
}
