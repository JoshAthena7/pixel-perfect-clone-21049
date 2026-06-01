
function PrimaryCta({ to, params, label, sub, icon, tone }: { to: string; params: any; label: string; sub: string; icon: React.ReactNode; tone?: "primary" }) {
  const base = tone === "primary"
    ? "border-primary/40 bg-primary/10 hover:bg-primary/15 text-primary"
    : "border-border bg-surface hover:bg-surface-hover text-foreground";
  return (
    <Link to={to as any} params={params} className={`group flex items-center justify-between gap-4 rounded-[12px] border px-5 py-4 transition ${base}`}>
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-background/40 p-2">{icon}</span>
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground">{sub}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
