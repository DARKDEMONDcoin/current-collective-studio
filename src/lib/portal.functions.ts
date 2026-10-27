import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Linguist Portal data. Every function checks the caller holds the LINGUIST/ADMIN role,
// then reads only jobs that are open to them (pool rules) or assigned to them.

async function ctx(context: any) {
  const L = await import("@/lib/linguist.server");
  const role = await L.linguistRole(context.supabase, context.userId);
  if (!role) throw new Error("Forbidden");
  const { data: profile } = await context.supabase.from("ct_profiles").select("name,email,avatar_url").eq("user_id", context.userId).maybeSingle();
  const user = { id: context.userId, name: profile?.name ?? null, email: profile?.email ?? null, image: profile?.avatar_url ?? null, role };
  return { L, db: await L.adminDb(), user, userId: context.userId as string };
}

const mapNotif = (n: any) => ({
  id: n.id, type: n.event_key?.startsWith("task.assigned") ? "NEW_JOB" : n.event_key?.includes("approved") ? "PAYMENT" : "SYSTEM",
  title: n.title, message: n.body, link: n.link, isRead: !!n.is_read, createdAt: n.created_at,
});

export const getPortalShell = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const L = await import("@/lib/linguist.server");
    const role = await L.linguistRole(context.supabase, context.userId);
    const { data: profile } = await context.supabase.from("ct_profiles").select("name,email,avatar_url").eq("user_id", context.userId).maybeSingle();
    return { user: { id: context.userId, name: profile?.name ?? null, email: profile?.email ?? null, image: profile?.avatar_url ?? null, role: role ?? "CLIENT", studioSubscribed: false }, isLinguist: !!role };
  });

export const getLinguistHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { L, db, user, userId } = await ctx(context);
    const [pool, active, done, { data: notes }] = await Promise.all([
      L.listPool(db, userId, 10),
      L.myJobs(db, userId, ["ACCEPTED", "IN_PROGRESS", "SUBMITTED"], 5),
      L.myJobs(db, userId, ["COMPLETED"], 1000),
      db.from("ct_in_app_notifications").select("*").eq("user_id", userId).eq("is_read", false).order("created_at", { ascending: false }).limit(3),
    ]);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const sum = (js: any[]) => js.reduce((n, j) => n + Number(j.payout_amount ?? 0), 0);
    return {
      user,
      availableJobs: pool.map(L.shapeJob),
      myJobs: active.map(L.shapeJob),
      profile: null,
      notifications: (notes ?? []).map(mapNotif),
      earnings: { _count: done.length, _sum: { payoutAmount: sum(done) } },
      monthEarnings: { _sum: { payoutAmount: sum(done.filter((j) => j.completed_at && new Date(j.completed_at).getTime() >= monthStart)) } },
    };
  });

export const getJobFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { L, db, user, userId } = await ctx(context);
    const [{ data: favs }, pool] = await Promise.all([
      db.from("ct_favorite_linguists").select("customer_id").eq("linguist_id", userId),
      L.listPool(db, userId, 100),
    ]);
    return { user, favoriteClientIds: (favs ?? []).map((f) => f.customer_id), jobs: pool.map(L.shapeJob) };
  });

export const getAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { L, db, user, userId } = await ctx(context);
    const [active, completed] = await Promise.all([
      L.myJobs(db, userId, ["ACCEPTED", "IN_PROGRESS", "SUBMITTED"]),
      L.myJobs(db, userId, ["COMPLETED"], 10),
    ]);
    return { user, active: active.map(L.shapeJob), completed: completed.map(L.shapeJob) };
  });

export const getEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { L, db, user, userId } = await ctx(context);
    const [completedJobs, pendingJobs] = await Promise.all([
      L.myJobs(db, userId, ["COMPLETED"], 500),
      L.myJobs(db, userId, ["ACCEPTED", "IN_PROGRESS", "SUBMITTED"]),
    ]);
    return { user, completedJobs: completedJobs.map(L.shapeJob), pendingJobs: pendingJobs.map(L.shapeJob) };
  });

export const getPortalNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, user, userId } = await ctx(context);
    const { data } = await db.from("ct_in_app_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    return { user, notifications: (data ?? []).map(mapNotif) };
  });
