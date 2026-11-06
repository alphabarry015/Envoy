import SiteHeader from "./SiteHeader";
import FiberField from "./ui/FiberField";
import SplitPillButton from "./ui/SplitPillButton";

export default function HeroSection() {
  return (
    <section
      id="overview"
      className="relative flex min-h-svh flex-col overflow-hidden bg-[#0A4BD6] text-white"
    >
      <div className="pointer-events-none absolute inset-0 max-md:opacity-35">
        <FiberField />
      </div>
      <SiteHeader variant="overlay" />

      <div className="relative z-10 mx-auto flex w-full max-w-[92rem] flex-1 flex-col justify-start px-4 pt-6 pb-16 sm:px-5 md:px-8 md:pt-16 md:pb-32 lg:justify-center lg:pb-36">
        <p className="mb-6 font-mono text-xs tracking-widest text-white/80">
          <span aria-hidden="true">■ </span>
          OVERVIEW
        </p>
        <div className="grid items-end gap-6 sm:gap-10 lg:grid-cols-12 lg:gap-16">
          <h1 className="max-w-4xl min-w-0 text-4xl leading-tight font-semibold tracking-tight text-white sm:text-5xl md:text-7xl lg:col-span-8">
            Self-hosted{" "}
            <span className="block">transactional email</span>
            <span className="block">on Amazon SES</span>
          </h1>
          <div className="flex flex-col items-start gap-8 lg:col-span-4">
            <p className="max-w-md text-base leading-relaxed text-white/80 md:text-lg">
              Envoy is an open-source service that sends email through an
              Amazon SES v2 account. It manages sending domains, API keys,
              templates, delivery events and a suppression list from one
              console.
            </p>
            <SplitPillButton label="Request access" to="/request-access" />
          </div>
        </div>
      </div>
    </section>
  );
}
