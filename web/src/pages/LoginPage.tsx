import { KeyRound } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import SiteHeader from "../components/SiteHeader";
import FiberField from "../components/ui/FiberField";
import SplitPillButton from "../components/ui/SplitPillButton";
import { acceptInvite, readSession, signIn } from "../lib/auth";

const INPUT =
  "h-12 w-full rounded-sm border border-white/15 bg-white/5 px-5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7EB0FF] focus:ring-2 focus:ring-white/20";

const LABEL =
  "mb-2 block font-mono text-[11px] tracking-widest text-white/80 uppercase";

export default function LoginPage() {
  const navigate = useNavigate();
  const existing = readSession();
  const [params] = useSearchParams();
  const codeFromUrl = params.get("code")?.trim() ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteOpen, setInviteOpen] = useState(Boolean(codeFromUrl));
  const [inviteToken, setInviteToken] = useState(codeFromUrl);
  const [invitePassword, setInvitePassword] = useState("");
  const [invitePasswordConfirm, setInvitePasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (existing) {
    return <Navigate to="/console/overview" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate("/console/overview", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onActivate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      await acceptInvite(inviteToken, invitePassword, invitePasswordConfirm);
      navigate("/console/overview", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invite activation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-[#0A4BD6] text-white">
      <FiberField intensity={0.28} />
      <SiteHeader variant="overlay" />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-start px-4 py-8 sm:px-5 md:px-8 md:py-16">
        <h1 className="mb-8 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Sign in{" "}
          <span className="block">to the console.</span>
        </h1>
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="rounded-sm border border-white/15 bg-[#0839B0]/80 p-6 md:p-8"
          >
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[11px] tracking-widest text-white/80 uppercase">
                Workspace login
              </p>
              <span className="rounded-sm border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[11px] tracking-wide text-[#9ec4ff]">
                envoy console
              </span>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className={LABEL}>Work email</span>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className={INPUT}
                />
              </label>
              <label className="block">
                <span className={LABEL}>Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  className={INPUT}
                />
              </label>
              <SplitPillButton
                label={submitting ? "Signing in" : "Sign In"}
                type="submit"
                className="w-full justify-center"
              />
            </form>

            <AnimatePresence>
              {message ? (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-5 rounded-sm border border-white/15 bg-[#0842BC]/40 px-4 py-3 text-sm text-[#9ec4ff]"
                >
                  {message}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <div className="mt-8 border-t border-white/10 pt-6">
              <button
                type="button"
                onClick={() => setInviteOpen((open) => !open)}
                className="inline-flex items-center gap-2 text-sm text-white/80 transition-colors hover:text-white"
              >
                <KeyRound className="size-3.5" aria-hidden="true" />
                {inviteOpen ? "Hide" : "Have an invitation code?"}
              </button>

              <AnimatePresence>
                {inviteOpen ? (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={onActivate}
                    className="mt-4 space-y-3 overflow-hidden"
                  >
                    <p className="text-sm leading-relaxed text-white/70">
                      Enter the code from your invitation email, then choose your password.
                    </p>
                    <label className="block">
                      <span className={LABEL}>Invitation code</span>
                      <input
                        value={inviteToken}
                        onChange={(event) => setInviteToken(event.target.value)}
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        autoCapitalize="characters"
                        autoComplete="one-time-code"
                        spellCheck={false}
                        className={`${INPUT} font-mono tracking-wider uppercase`}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className={LABEL}>Password</span>
                      <input
                        type="password"
                        value={invitePassword}
                        onChange={(event) => setInvitePassword(event.target.value)}
                        autoComplete="new-password"
                        className={INPUT}
                        required
                        minLength={10}
                      />
                    </label>
                    <label className="block">
                      <span className={LABEL}>Confirm password</span>
                      <input
                        type="password"
                        value={invitePasswordConfirm}
                        onChange={(event) => setInvitePasswordConfirm(event.target.value)}
                        autoComplete="new-password"
                        className={INPUT}
                        required
                        minLength={10}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-sm border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                    >
                      Activate account
                    </button>
                  </motion.form>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
