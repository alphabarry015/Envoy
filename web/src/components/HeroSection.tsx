import SiteHeader from "./SiteHeader";
import FiberField from "./ui/FiberField";
import SplitPillButton from "./ui/SplitPillButton";

export default function HeroSection() {
  return (
    <section
      id="overview"
      className="relative flex min-h-svh flex-col overflow-hidden bg-[#0A4BD6] text-white"
    >
      <FiberField />
      <SiteHeader variant="overlay" />

      <div className="relative z-10 mx-auto flex w-full max-w-[92rem] flex-1 flex-col justify-end px-5 pt-10 pb-28 md:px-8 md:pt-16 md:pb-32 lg:justify-center lg:pb-36">
        <p className="mb-6 font-mono text-xs tracking-widest text-white/50">
          <span aria-hidden="true">■ </span>
          FOUNDATION
        </p>
        <div className="grid items-end gap-10 lg:grid-cols-12 lg:gap-16">
          <h1 className="max-w-4xl min-w-0 text-5xl leading-tight font-semibold tracking-tight text-white md:text-7xl lg:col-span-8">
            Sovereign Email{" "}
            <span className="block">Infrastructure</span>
            <span className="block">Built for Scale</span>
          </h1>
          <div className="flex flex-col items-start gap-8 lg:col-span-4">
            <p className="max-w-md text-base leading-relaxed text-white/70 md:text-lg">
              An open-source, self-hosted alternative to Resend. Reduce
              transactional email costs by up to 90% using direct AWS SES v2
              infrastructure with zero per-domain limits.
            </p>
            <SplitPillButton label="Get Started" to="/request-access" />
          </div>
        </div>
      </div>
    </section>
  );
}
