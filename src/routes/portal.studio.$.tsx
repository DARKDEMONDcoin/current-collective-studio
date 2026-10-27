import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/studio/$")({
  head: () => ({ meta: [{ title: "Linguist Portal — Contentech" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <h1 className="text-xl font-bold text-navy mb-2">Coming soon</h1>
        <p className="text-sm text-gray-500">This section of the Linguist Portal is being set up.</p>
      </div>
    </div>
  ),
});
