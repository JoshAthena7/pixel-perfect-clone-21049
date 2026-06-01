// DESIGN-1: Skeleton primitives mirroring incoming content layouts.
import { type CSSProperties } from "react";

export function Skel({ w, h, className = "", style }: { w?: string | number; h?: string | number; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width: w, height: h ?? 12, ...style }}
      aria-hidden
    />
  );
}

export function MissionCardSkeleton() {
  return (
    <div className="rounded-[12px] border border-border border-l-4 border-l-border bg-surface p-5" style={{ minHeight: 160 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skel w="65%" h={18} />
          <Skel w="40%" h={10} />
        </div>
        <Skel w={48} h={18} className="rounded-full" />
      </div>
      <div className="mt-5 flex items-center gap-2">
        <Skel w={56} h={18} className="rounded-full" />
        <Skel w={36} h={18} className="rounded-full" />
        <Skel w={40} h={14} className="ml-auto" />
      </div>
      <div className="mt-5 border-t border-border pt-3">
        <Skel w="30%" h={10} />
      </div>
    </div>
  );
}

export function MissionGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => <MissionCardSkeleton key={i} />)}
    </div>
  );
}

export function QuestionRowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <Skel w={8} h={8} className="rounded-full" />
      <Skel w={90} h={16} className="rounded-full" />
      <Skel w={32} h={10} />
      <Skel w="40%" h={12} className="flex-1" />
      <Skel w={32} h={10} />
      <Skel w={40} h={12} />
    </li>
  );
}

export function QuestionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
      {Array.from({ length: count }).map((_, i) => <QuestionRowSkeleton key={i} />)}
    </ul>
  );
}

export function StatNumberSkeleton() {
  return <Skel w={56} h={28} />;
}

export function SectionLineSkeleton() {
  return (
    <div className="space-y-2 py-2">
      <Skel w="80%" h={12} />
      <Skel w="60%" h={10} />
    </div>
  );
}
