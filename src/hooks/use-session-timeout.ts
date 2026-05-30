import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Signs the user out after 30 minutes of inactivity. Activity is any
 * mouse/keyboard/touch/scroll event in the window. Resets on auth changes.
 */
export function useSessionTimeout(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        toast.warning("Signed out after 30 minutes of inactivity.");
        await supabase.auth.signOut();
      }, TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [enabled]);
}
