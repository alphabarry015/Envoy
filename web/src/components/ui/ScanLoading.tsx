import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "onLight" | "onDark";

const TONE: Record<
  Tone,
  { shell: string; bar: string; text: string }
> = {
  onLight: {
    shell: "border-[#0A4BD6]/30 bg-[#0A4BD6]/10 text-[#0A4BD6]",
    bar: "bg-[#0A4BD6]/20",
    text: "text-[#0A4BD6]",
  },
  onDark: {
    shell: "border-white/20 bg-white/10 text-white",
    bar: "bg-white/25",
    text: "text-white",
  },
};

/** Animated scan tile — place inside a `relative overflow-hidden` container. */
export function ScanBar({
  tone = "onLight",
  className = "",
}: {
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`envoy-scan-bar absolute inset-y-0 left-0 w-1/3 ${TONE[tone].bar} ${className}`}
      aria-hidden="true"
    />
  );
}

type ScanLoadingProps = {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  /** denser padding for badges / compact chips */
  size?: "sm" | "md";
};

/** Non-interactive loading chip with the Envoy scan animation. */
export function ScanLoading({
  children,
  tone = "onLight",
  className = "",
  size = "sm",
}: ScanLoadingProps) {
  const pad = size === "md" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-xs";
  return (
    <span
      className={`relative inline-flex items-center overflow-hidden rounded-sm border font-medium ${TONE[tone].shell} ${pad} ${className}`}
      role="status"
      aria-live="polite"
    >
      <ScanBar tone={tone} />
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </span>
  );
}

type ScanLoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  tone?: Tone;
  idleClassName?: string;
  loadingLabel?: ReactNode;
  children: ReactNode;
};

/**
 * Button that swaps to the scan loading style while `loading` is true.
 * Use for Verify / Submit / any async console action.
 */
export function ScanLoadingButton({
  loading = false,
  tone = "onLight",
  idleClassName = "",
  loadingLabel,
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ScanLoadingButtonProps) {
  if (loading) {
    return (
      <button
        type={type}
        disabled
        aria-busy="true"
        className={`relative inline-flex items-center overflow-hidden rounded-sm border px-3 py-1.5 text-xs font-medium ${TONE[tone].shell} ${className}`}
        {...props}
      >
        <ScanBar tone={tone} />
        <span className="relative inline-flex items-center gap-1.5">
          {loadingLabel ?? children}
        </span>
      </button>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${idleClassName} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
