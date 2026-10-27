import { Loader2 } from "lucide-react";
import Link from "@/compat/next-link";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/compat/next-auth";

// Shown for signed-in areas that will arrive in the next migration stages.
export function NextStage({ area, loginHref }: { area: string; loginHref: string }) {
  const { data, status } = useSession();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md bg-card rounded-2xl border shadow-sm p-8 text-center">
        <span className="block text-2xl font-bold tracking-tight text-navy mb-6">Contentech</span>
        {status === "loading" ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        ) : data ? (
          <>
            <h1 className="text-xl font-semibold text-navy mb-2">{area}</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Signed in as <strong>{data.user.email}</strong>
              {data.user.role ? ` (${data.user.role.toLowerCase()})` : ""}. This area is being moved
              over and will be available soon.
            </p>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-navy mb-2">Please sign in</h1>
            <p className="text-sm text-muted-foreground mb-6">
              You need to be signed in to open the {area}.
            </p>
            <Link href={loginHref}>
              <Button>Sign in</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
