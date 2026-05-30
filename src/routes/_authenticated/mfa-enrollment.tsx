import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mfa-enrollment")({
  head: () => ({ meta: [{ title: "Enable Two-Factor — Athena War Room" }] }),
  component: MfaEnrollmentPage,
});

function MfaEnrollmentPage() {
  const navigate = useNavigate();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Check if already verified
        const { data: factors } = await supabase.auth.mfa.listFactors();
        if (factors?.totp?.some((f) => f.status === "verified")) {
          navigate({ to: "/command", replace: true });
          return;
        }
        // Clean up any unverified factors first
        for (const f of factors?.totp ?? []) {
          if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Athena TOTP" });
        if (error) throw error;
        setQr(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to start enrollment");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  async function verify() {
    if (!factorId || !code) return;
    setVerifying(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (vErr) throw vErr;
      toast.success("Two-factor authentication enabled.");
      navigate({ to: "/command", replace: true });
    } catch (e: any) {
      toast.error(e.message ?? "Invalid code");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-border bg-surface p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-[var(--gold)]/15 p-2 text-[var(--gold)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Enable two-factor authentication</h1>
            <p className="text-xs text-muted-foreground">Required for all Athena accounts.</p>
          </div>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Generating secret…</div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <p>1. Open your authenticator app (Google Authenticator, 1Password, Authy).</p>
              <p>2. Scan this QR code or enter the secret manually.</p>
              <p>3. Enter the 6-digit code below.</p>
            </div>
            {qr && (
              <div className="flex justify-center rounded-md bg-white p-3">
                <img src={qr} alt="Scan with authenticator" width={180} height={180} />
              </div>
            )}
            {secret && (
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Manual secret</Label>
                <div className="mt-1 break-all rounded bg-surface-hover px-2 py-1 font-mono text-xs">{secret}</div>
              </div>
            )}
            <div>
              <Label>6-digit code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
              />
            </div>
            <Button onClick={verify} disabled={code.length !== 6 || verifying} className="w-full">
              {verifying ? "Verifying…" : "Verify & enable"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
