import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BRAND, serif } from "@/components/asg/shell";

export const Route = createFileRoute("/demo/login")({
  component: LoginScreen,
});

function LoginScreen() {
  const nav = useNavigate();
  const [email, setEmail] = useState("alex.morgan@athenastrategy.com");
  const [pw, setPw] = useState("••••••••••");
  return (
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: BRAND.bg, color: BRAND.text }}>
      <div className="w-full max-w-md">
        <div className="mb-2 text-center text-[10px] font-semibold tracking-[0.28em]" style={{ color: BRAND.gold }}>
          ATHENA STRATEGY GROUP
        </div>
        <h1 style={{ ...serif, color: BRAND.navy }} className="text-center text-6xl leading-none">
          Atlas
        </h1>
        <p className="mt-4 text-center text-sm text-neutral-600">
          Proposal intelligence for the work that matters.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            nav({ to: "/demo" });
          }}
          className="mt-12 space-y-5"
        >
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold tracking-[0.18em] text-neutral-500">
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border bg-white px-3 py-2.5 text-sm outline-none focus:border-[color:var(--gold)]"
              style={{ borderColor: BRAND.border, ["--gold" as any]: BRAND.gold }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold tracking-[0.18em] text-neutral-500">
              PASSWORD
            </label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full border bg-white px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: BRAND.border }}
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 text-[11px] font-semibold tracking-[0.22em] text-white transition-opacity hover:opacity-90"
            style={{ background: BRAND.navy }}
          >
            ENTER ATLAS
          </button>
          <div className="flex justify-between text-xs text-neutral-500">
            <Link to="/demo" className="hover:underline">Reset password</Link>
            <span>Need access? Contact your lead.</span>
          </div>
        </form>

        <div className="mt-20 text-center">
          <p className="text-xs italic text-neutral-500" style={serif}>
            Solutions with a soul.
          </p>
        </div>
      </div>
    </div>
  );
}
