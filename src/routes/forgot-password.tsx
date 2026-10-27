import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/views/auth/layout";
import Link from "@/compat/next-link";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Contentech" },
      { name: "description", content: "Get a link to reset your Contentech password." },
      { property: "og:title", content: "Reset Password — Contentech" },
      { property: "og:description", content: "Get a link to reset your Contentech password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }
  return (
    <AuthLayout>
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <h1 className="text-2xl font-bold text-navy mb-2">Reset your password</h1>
        {sent ? (
          <p className="text-sm text-gray-600">
            If an account exists for {email}, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-6">
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
            />
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-teal font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
