import { Link } from "@tanstack/react-router";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AthenaMark } from "@/components/AthenaMark";

export function AdminTopbar() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 text-xs">
      <AthenaMark size="sm" variant="lockup" tone="white" className="hidden md:block" />
      <AthenaMark size="sm" variant="mark" tone="white" className="md:hidden" />
      <span className="hidden md:inline text-muted-foreground">·</span>

      <span className="font-bold text-sm truncate">Executive Command</span>
      <span className="hidden lg:inline text-muted-foreground truncate">/ All Engagements</span>

      <div className="ml-auto flex items-center gap-2">
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
          <Link to="/admin/messaging">
            <Megaphone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Global Message</span>
          </Link>
        </Button>
        <Button asChild size="sm" className="h-8 gap-1.5">
          <Link to="/engagement/new">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Engagement</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
