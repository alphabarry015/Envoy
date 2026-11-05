type SectionHeaderProps = {
  kicker: string;
  title: string;
  description?: string;
  tone?: "light" | "dark";
};

export default function SectionHeader({
  kicker,
  title,
  description,
  tone = "light",
}: SectionHeaderProps) {
  const kickerClass =
    tone === "dark" ? "text-white/50" : "text-[#0A4BD6]/60";
  const titleClass = tone === "dark" ? "text-white" : "text-neutral-950";
  const copyClass = tone === "dark" ? "text-white/70" : "text-neutral-600";

  return (
    <div className="max-w-3xl">
      <p
        className={`mb-5 font-mono text-xs tracking-widest uppercase ${kickerClass}`}
      >
        <span aria-hidden="true">■ </span>
        {kicker}
      </p>
      <h2
        className={`text-3xl leading-tight font-semibold tracking-tight md:text-5xl ${titleClass}`}
      >
        {title}
      </h2>
      {description ? (
        <p className={`mt-5 max-w-xl text-base leading-relaxed md:text-lg ${copyClass}`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
