import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/checkin/$token")({
  ssr: false,
  component: CheckinPage,
});

function CheckinPage() {
  return (
    <div className="min-h-dvh w-full bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-[680px]">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" aria-hidden />
          <h1 className="mb-1 text-xl font-medium text-slate-900">Check-in unavailable</h1>
          <p className="text-[14px] text-slate-600">Check-in links are being rebuilt after the legacy cleanup.</p>
          <Link to="/login" className="mt-6 inline-block text-[14px] font-medium text-blue-600 hover:underline">
            Go to login
          </Link>
        </div>
      </div>
    </div>
  );
}