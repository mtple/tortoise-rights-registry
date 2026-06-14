// Tortoise-style loading spinner — the Tortoise icon rotating in place.
// Mirrors the reference implementation in the main Tortoise app (full-screen overlay,
// icon at 1.5s linear infinite, cream/dark background). Uses the `spin` keyframe in globals.css.

interface LoadingAnimationProps {
  message?: string;
}

export function LoadingAnimation({ message }: LoadingAnimationProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#cbbfb9] dark:bg-[#0a0a0a]">
      <img
        src="/transparent-icon.png"
        alt={message || "Loading..."}
        className="h-16 w-16"
        style={{ animation: "spin 1.5s linear infinite" }}
      />
      {message && <p className="mt-4 text-sm text-ink/70">{message}</p>}
    </div>
  );
}
