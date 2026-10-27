import Link from "@/compat/next-link";
import { ArrowLeft, Plug } from "lucide-react";

// Shown for CMS connectors that are not yet migrated to the new platform.
export default function CmsPending({ name }: { name: string }) {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/dashboard/integrations" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#33475B] mb-4">
        <ArrowLeft className="w-4 h-4" /> All integrations
      </Link>
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <Plug className="w-8 h-8 text-[#FF7A59] mx-auto mb-3" />
        <h1 className="text-xl font-semibold text-[#33475B] mb-2">{name} connection is being set up</h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Connecting {name} is not available yet. Until then, export your content and upload it as a new order — translated files can be downloaded from the project page.
        </p>
        <Link href="/dashboard/wizard" className="inline-block mt-5 text-sm font-medium text-[#0091AE] hover:underline">Start a new order →</Link>
      </div>
    </div>
  );
}
