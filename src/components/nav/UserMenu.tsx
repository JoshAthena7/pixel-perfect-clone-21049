import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function UserMenu({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const initials = (email ?? "?")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) { toast.error(error.message); return; }
    toast.success("Signed out");
    navigate({ to: "/login" });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-full bg-[var(--athena-gold)]/20 border border-[var(--athena-gold)]/50 text-[var(--athena-gold)] text-[12px] font-medium flex items-center justify-center hover:bg-[var(--athena-gold)]/30"
        aria-label="User menu"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 rounded-md border border-border bg-popover shadow-lg z-[60] py-1">
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-[14px] hover:bg-muted"
          >
            Profile
          </Link>
          <button
            onClick={signOut}
            className="block w-full text-left px-3 py-1.5 text-[14px] hover:bg-muted"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
