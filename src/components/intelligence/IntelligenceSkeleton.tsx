export function IntelligenceSkeleton({ label = "Loading IRIS intelligence" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 animate-pulse" aria-label={label}>
      <div className="h-24 rounded-lg bg-white/[0.04] border border-white/5 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="h-32 rounded-lg bg-white/[0.04] border border-white/5" />
        <div className="h-32 rounded-lg bg-white/[0.04] border border-white/5" />
        <div className="h-32 rounded-lg bg-white/[0.04] border border-white/5" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="h-48 rounded-lg bg-white/[0.04] border border-white/5" />
        <div className="h-48 rounded-lg bg-white/[0.04] border border-white/5" />
      </div>
      <div className="h-40 rounded-lg bg-white/[0.04] border border-white/5" />
    </div>
  );
}

export function IntelligenceErrorCard({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-[800px] mt-12 rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
      <h3 className="text-lg font-semibold text-red-300 mb-2">IRIS could not produce intelligence</h3>
      <p className="text-sm text-red-200/80 mb-4">
        IRIS encountered an issue processing this document set. Try regenerating or check that documents contain extractable text.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-md bg-red-500/20 text-red-100 hover:bg-red-500/30 text-sm"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function IntelligenceEmpty({ missionId, layerLabel }: { missionId: string; layerLabel: string }) {
  return (
    <div className="mx-auto max-w-[800px] mt-16 rounded-lg border border-white/10 bg-white/[0.02] p-8 text-center">
      <h3 className="text-xl font-semibold text-white mb-2">No {layerLabel} yet</h3>
      <p className="text-sm text-white/60 mb-6">
        Upload procurement documents to the Intelligence Vault and ask IRIS to generate this layer.
      </p>
      <a
        href={`/missions/${missionId}/intel-upload`}
        className="inline-block px-5 py-2 rounded-md text-sm font-medium"
        style={{ background: "#C9A84C", color: "#0a0e1a" }}
      >
        Open Intelligence Vault
      </a>
    </div>
  );
}
