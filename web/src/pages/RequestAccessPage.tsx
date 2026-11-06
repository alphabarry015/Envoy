import { Building2, Check, Mail, Server } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import SiteHeader from "../components/SiteHeader";
import FiberField from "../components/ui/FiberField";
import SplitPillButton from "../components/ui/SplitPillButton";

const VOLUMES = ["<10k", "10k-100k", "100k-1M", "1M+"] as const;

const INPUT =
  "h-12 w-full rounded-sm border border-white/15 bg-white/5 px-5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7EB0FF] focus:ring-2 focus:ring-white/20";

const LABEL =
  "mb-2 block font-mono text-[11px] tracking-widest text-white/80 uppercase";

type FormState = {
  fullName: string;
  email: string;
  organization: string;
  volume: (typeof VOLUMES)[number];
  useCase: string;
};

const EMPTY: FormState = {
  fullName: "",
  email: "",
  organization: "",
  volume: "10k-100k",
  useCase: "",
};

export default function RequestAccessPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-[#0A4BD6] text-white">
      <FiberField intensity={0.28} />
      <SiteHeader variant="overlay" />

      <div className="relative z-10 mx-auto grid w-full max-w-[92rem] flex-1 items-center gap-8 px-4 py-8 sm:px-5 md:gap-12 md:px-8 md:py-20 lg:grid-cols-12 lg:gap-16 lg:py-24">
        <div className="lg:col-span-5">
          <p className="mb-6 font-mono text-xs tracking-widest text-white/80 uppercase">
            <span aria-hidden="true">■ </span>
            Request access
          </p>
          <h1 className="max-w-xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl md:text-6xl">
            Request access{" "}
            <span className="block">to Envoy.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/80 md:text-lg">
            Accounts are created by invitation. Describe how you send
            transactional email. If the request is accepted, an invitation is
            sent to the address you provide.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/75">
              <Mail className="size-3.5 text-[#9ec4ff]" aria-hidden="true" />
              Invite-only
            </span>
            <span className="inline-flex items-center gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/75">
              <Server className="size-3.5 text-[#9ec4ff]" aria-hidden="true" />
              AWS SES v2
            </span>
            <span className="inline-flex items-center gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/75">
              <Building2 className="size-3.5 text-[#9ec4ff]" aria-hidden="true" />
              Workspace quota
            </span>
          </div>

          <p className="mt-10 text-sm text-white/80">
            Already provisioned?{" "}
            <Link
              to="/console/login"
              className="font-medium text-white underline-offset-4 hover:underline"
            >
              Sign in to console
            </Link>
          </p>
        </div>

        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="rounded-sm border border-white/15 bg-[#0839B0]/80 p-8 text-center md:p-12"
              >
                <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-sm border border-white/15 bg-white text-[#0A4BD6]">
                  <Check className="size-6" aria-hidden="true" />
                </span>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Request received.
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/80">
                  The request for {form.organization || "your organization"} will
                  be reviewed. If it is accepted, an invitation is sent to{" "}
                  {form.email}.
                </p>
                <Link
                  to="/"
                  className="mt-8 inline-flex rounded-sm bg-white px-5 py-3 text-sm font-medium text-[#0A4BD6] transition-opacity hover:bg-white/95"
                >
                  Back to overview
                </Link>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={onSubmit}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="rounded-sm border border-white/15 bg-[#0839B0]/80 p-6 md:p-8"
              >
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-[11px] tracking-widest text-white/80 uppercase">
                    Access request
                  </p>
                  <span className="rounded-sm border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[11px] tracking-wide text-[#9ec4ff]">
                    invite-only
                  </span>
                </div>

                <div className="space-y-4">
                  <Field
                    label="Full name"
                    value={form.fullName}
                    onChange={(value) => update("fullName", value)}
                    required
                  />
                  <Field
                    label="Work email"
                    type="email"
                    value={form.email}
                    onChange={(value) => update("email", value)}
                    required
                    placeholder="you@company.com"
                  />
                  <Field
                    label="Company / organization"
                    value={form.organization}
                    onChange={(value) => update("organization", value)}
                    required
                  />
                  <label className="block">
                    <span className={LABEL}>Estimated monthly volume</span>
                    <select
                      value={form.volume}
                      onChange={(event) =>
                        update("volume", event.target.value as FormState["volume"])
                      }
                      className={`${INPUT} appearance-none`}
                    >
                      {VOLUMES.map((volume) => (
                        <option key={volume} value={volume} className="bg-[#0A4BD6] text-white">
                          {volume}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={LABEL}>Primary use case</span>
                    <textarea
                      required
                      rows={4}
                      value={form.useCase}
                      onChange={(event) => update("useCase", event.target.value)}
                      placeholder="Password resets, invoices, product alerts…"
                      className="w-full rounded-sm border border-white/15 bg-white/5 px-5 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7EB0FF] focus:ring-2 focus:ring-white/20"
                    />
                  </label>
                  <SplitPillButton
                    label="Submit Access Request"
                    type="submit"
                    className="w-full justify-center"
                  />
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT}
      />
    </label>
  );
}
