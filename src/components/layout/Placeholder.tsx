export function Placeholder({ title }: { title: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>
        {title} — coming soon
      </p>
    </div>
  );
}
