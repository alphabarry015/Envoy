import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

type Variant = "onDark" | "onLight";

type SplitPillButtonProps = {
  label: string;
  variant?: Variant;
  to?: string;
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
};

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A4BD6]/50 focus-visible:ring-offset-2";

function tone(variant: Variant) {
  if (variant === "onLight") {
    return {
      text: "bg-[#0A4BD6] text-white group-hover:bg-[#0842BC]",
      icon: "bg-[#06369d] text-white border-white/10 group-hover:bg-[#052d82]",
      ring: "focus-visible:ring-offset-white",
    };
  }
  return {
    text: "bg-white text-[#0A4BD6] group-hover:bg-white/95",
    icon: "bg-[#0842BC] text-white border-white/10 group-hover:bg-[#06369d]",
    ring: "focus-visible:ring-offset-[#0A4BD6]",
  };
}

function Inner({ label, variant }: { label: string; variant: Variant }) {
  const classes = tone(variant);
  return (
    <>
      <span
        className={`inline-flex items-center rounded-l-sm px-6 py-3 text-sm font-medium transition-colors ${classes.text}`}
      >
        {label}
      </span>
      <span
        className={`inline-flex items-center rounded-r-sm border-l px-3.5 transition-colors ${classes.icon}`}
      >
        <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden="true" />
      </span>
    </>
  );
}

export default function SplitPillButton({
  label,
  variant = "onDark",
  to,
  href,
  type,
  onClick,
  className = "",
}: SplitPillButtonProps) {
  const classes = tone(variant);
  const shell = `group inline-flex items-stretch rounded-sm ${FOCUS} ${classes.ring} ${className}`;

  if (to) {
    return (
      <Link to={to} className={shell}>
        <Inner label={label} variant={variant} />
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={shell}>
        <Inner label={label} variant={variant} />
      </a>
    );
  }

  return (
    <button type={type ?? "button"} onClick={onClick} className={shell}>
      <Inner label={label} variant={variant} />
    </button>
  );
}
