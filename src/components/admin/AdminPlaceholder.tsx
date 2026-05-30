import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function AdminPlaceholder({
  icon: Icon,
  title,
  description,
  comingSoon,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  comingSoon: string;
}) {
  return (
    <div className="mx-auto max-w-[1600px] p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <Card className="border-border/60 bg-[#141628] border-dashed">
        <div className="flex flex-col items-center justify-center text-center px-6 py-20">
          <div className="rounded-full bg-white/[0.03] border border-border/40 p-4 mb-4">
            <Icon className="h-7 w-7 text-[var(--gold)]" />
          </div>
          <h2 className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
            Coming soon
          </h2>
          <p className="text-sm text-foreground/80 mt-2 max-w-md">{comingSoon}</p>
        </div>
      </Card>
    </div>
  );
}
