"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";

// Small inline tortoise spinner — the same brand mark as the (former) full-page loader, sized to
// sit next to a label. Rendered as a CSS mask filled with currentColor so it picks up the host's
// text colour (cream on ink buttons) and stays visible on any background. Spins via the `spin`
// keyframe in globals.css.
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={"inline-block shrink-0 " + className}
      style={{
        backgroundColor: "currentColor",
        WebkitMaskImage: "url(/transparent-icon.png)",
        maskImage: "url(/transparent-icon.png)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        animation: "spin 1.5s linear infinite",
      }}
    />
  );
}

export function Button({
  children,
  className = "",
  loading = false,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; loading?: boolean }) {
  return (
    <button
      className={
        "inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 font-medium text-cream transition disabled:cursor-not-allowed " +
        "disabled:opacity-50 hover:opacity-90 " +
        className
      }
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={"rounded-xl border border-ink/20 bg-cream/60 p-5 shadow-sm " + className}>{children}</div>
  );
}

export function StatusBadge({ kind, children }: { kind: "ok" | "warn" | "info"; children: ReactNode }) {
  const tone =
    kind === "ok"
      ? "bg-grape text-white"
      : kind === "warn"
        ? "bg-amber-600 text-white"
        : "bg-ink text-cream";
  return <span className={"inline-block rounded-full px-2.5 py-0.5 text-xs font-medium " + tone}>{children}</span>;
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// Single wallet control used everywhere: "Connect wallet" → a Tortoise-styled modal of the
// browser wallets wagmi discovered (injected/EIP-6963); once connected, shows the address + a
// "Disconnect" button. No Base Account option (intentionally removed from this app).
export function WalletButton({ className = "" }: { className?: string }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  // De-dupe connectors by name (EIP-6963 can surface the generic "Injected" alongside a named
  // wallet); keep the named ones.
  const seen = new Set<string>();
  const options: Connector[] = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  if (isConnected && address) {
    return (
      <div className={"flex items-center gap-3 " + className}>
        <span className="font-mono text-xs text-ink/70">{shortAddr(address)}</span>
        <Button onClick={() => disconnect()}>Disconnect wallet</Button>
      </div>
    );
  }

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        Connect wallet
      </Button>
      {open && (
        <WalletModal
          options={options}
          isPending={isPending}
          onPick={(c) => {
            connect({ connector: c });
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function WalletModal({
  options,
  isPending,
  onPick,
  onClose,
}: {
  options: Connector[];
  isPending: boolean;
  onPick: (c: Connector) => void;
  onClose: () => void;
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl bg-cream p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
      >
        <div className="text-center">
          <p className="text-lg font-bold text-ink">Connect a wallet</p>
          <p className="text-sm text-ink/70">to opt songs in or buy a license</p>
        </div>

        <div className="space-y-2.5">
          {options.length === 0 ? (
            <p className="rounded-xl bg-white/70 p-4 text-center text-sm text-ink/70">
              No browser wallet detected. Install MetaMask, Rainbow, Phantom, or another wallet
              extension and reload.
            </p>
          ) : (
            options.map((c) => (
              <button
                key={c.uid}
                onClick={() => onPick(c)}
                disabled={isPending}
                className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left font-semibold text-ink shadow-sm transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="h-6 w-6 rounded" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded bg-ink text-[10px] font-bold text-cream">
                    {c.name.slice(0, 1)}
                  </span>
                )}
                <span>Sign in with {c.name}</span>
              </button>
            ))
          )}
        </div>

        <button onClick={onClose} className="block w-full text-center text-sm text-ink/70 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
