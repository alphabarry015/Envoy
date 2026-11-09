import { ArrowLeft, KeyRound } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import SiteHeader from "../components/SiteHeader";
import FiberField from "../components/ui/FiberField";
import SplitPillButton from "../components/ui/SplitPillButton";
import {
  acceptInvite,
  readSession,
  requestPasswordReset,
  resetPassword,
  signIn,
  verifyResetCode,
} from "../lib/auth";
import { formatInviteCode } from "../lib/inviteCode";
import { formatResetCode, isCompleteResetCode } from "../lib/resetCode";

const INPUT =
  "h-12 w-full rounded-sm border border-white/15 bg-white/5 px-5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7EB0FF] focus:ring-2 focus:ring-white/20";

const LABEL =
  "mb-2 block font-mono text-[11px] tracking-widest text-white/80 uppercase";

const CARD = "rounded-sm border border-white/15 bg-[#0839B0]/80 p-6 md:p-8";

type View = "signin" | "forgot-email" | "forgot-code" | "forgot-password";

const RESET_STEPS: Record<
  Exclude<View, "signin">,
  { step: string; title: string }
> = {
  "forgot-email": { step: "Step 1 of 3", title: "Reset your password" },
  "forgot-code": { step: "Step 2 of 3", title: "Enter your code" },
  "forgot-password": { step: "Step 3 of 3", title: "Choose a new password" },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const existing = readSession();
  const [params] = useSearchParams();
  const codeFromUrl = params.get("code")?.trim() ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteOpen, setInviteOpen] = useState(Boolean(codeFromUrl));
  const [inviteToken, setInviteToken] = useState(() =>
    formatInviteCode(codeFromUrl),
  );
  const [invitePassword, setInvitePassword] = useState("");
  const [invitePasswordConfirm, setInvitePasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<View>("signin");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  if (existing) {
    return <Navigate to="/console/overview" replace />;
  }

  function goTo(next: View) {
    setMessage(null);
    setView(next);
  }

  function openForgot() {
    setNotice(null);
    setResetEmail(email);
    setResetCode("");
    setNewPassword("");
    setNewPasswordConfirm("");
    goTo("forgot-email");
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setMessage(null);
    setSubmitting(true);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallback);
    } finally {
      setSubmitting(false);
    }
  }

  function onSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await requestPasswordReset(resetEmail);
      setResetCode("");
      goTo("forgot-code");
    }, "Could not send the code.");
  }

  function onResendCode() {
    void run(async () => {
      await requestPasswordReset(resetEmail);
      setResetCode("");
      setNotice("A new code is on its way. The previous one no longer works.");
    }, "Could not send a new code.");
  }

  function onCheckCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCompleteResetCode(resetCode)) {
      setMessage("Enter the 6 digits from the email.");
      return;
    }
    void run(async () => {
      await verifyResetCode(resetEmail, resetCode);
      setNotice(null);
      goTo("forgot-password");
    }, "Could not check the code.");
  }

  function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      setMessage("Passwords do not match.");
      return;
    }
    void run(async () => {
      await resetPassword(
        resetEmail,
        resetCode,
        newPassword,
        newPasswordConfirm,
      );
      setEmail(resetEmail.trim().toLowerCase());
      setPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setResetCode("");
      setNotice("Password updated. Sign in with your new password.");
      goTo("signin");
    }, "Could not reset the password.");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setNotice(null);
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
      setMessage(
        error instanceof Error ? error.message : "Invite activation failed.",
      );
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
          {view === "signin" ? (
            <>
              Sign in <span className="block">to the console.</span>
            </>
          ) : (
            <>
              Forgot your <span className="block">password?</span>
            </>
          )}
        </h1>
        <AnimatePresence mode="wait">
          {view === "signin" ? (
            <motion.div
              key="signin"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={CARD}
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
                <div className="-mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={openForgot}
                    className="text-sm text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <SplitPillButton
                  label={submitting ? "Signing in" : "Sign In"}
                  type="submit"
                  className="w-full justify-center"
                />
              </form>

              {notice ? (
                <p className="mt-5 rounded-sm border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  {notice}
                </p>
              ) : null}

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
                        Enter the code from your invitation email, then choose
                        your password.
                      </p>
                      <label className="block">
                        <span className={LABEL}>Invitation code</span>
                        <input
                          value={inviteToken}
                          onChange={(event) =>
                            setInviteToken(formatInviteCode(event.target.value))
                          }
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
                          onChange={(event) =>
                            setInvitePassword(event.target.value)
                          }
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
                          onChange={(event) =>
                            setInvitePasswordConfirm(event.target.value)
                          }
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
          ) : (
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={CARD}
            >
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[11px] tracking-widest text-white/80 uppercase">
                  {RESET_STEPS[view].step}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    goTo("signin");
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white"
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  Back to sign in
                </button>
              </div>
              <h2 className="mb-2 text-xl font-semibold tracking-tight">
                {RESET_STEPS[view].title}
              </h2>

              {view === "forgot-email" ? (
                <form onSubmit={onSendCode} className="space-y-4">
                  <p className="text-sm leading-relaxed text-white/70">
                    Enter the email of your console account. We send a 6-digit
                    code to it.
                  </p>
                  <label className="block">
                    <span className={LABEL}>Work email</span>
                    <input
                      type="email"
                      required
                      autoFocus
                      autoComplete="username"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      placeholder="you@company.com"
                      className={INPUT}
                    />
                  </label>
                  <SplitPillButton
                    label={submitting ? "Sending" : "Send the code"}
                    type="submit"
                    className="w-full justify-center"
                  />
                </form>
              ) : null}

              {view === "forgot-code" ? (
                <form onSubmit={onCheckCode} className="space-y-4">
                  <p className="text-sm leading-relaxed text-white/70">
                    If an account exists for{" "}
                    <span className="font-medium text-white">
                      {resetEmail.trim().toLowerCase()}
                    </span>
                    , a 6-digit code is on its way. It expires in 15 minutes.
                  </p>
                  <label className="block">
                    <span className={LABEL}>Code</span>
                    <input
                      value={resetCode}
                      onChange={(event) =>
                        setResetCode(formatResetCode(event.target.value))
                      }
                      placeholder="123-456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      spellCheck={false}
                      maxLength={7}
                      className={`${INPUT} text-center font-mono text-2xl tracking-[0.3em]`}
                      required
                    />
                  </label>
                  <SplitPillButton
                    label={submitting ? "Checking" : "Continue"}
                    type="submit"
                    className="w-full justify-center"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/70">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={onResendCode}
                      className="underline-offset-4 transition-colors hover:text-white hover:underline disabled:opacity-50"
                    >
                      Send a new code
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo("forgot-email")}
                      className="underline-offset-4 transition-colors hover:text-white hover:underline"
                    >
                      Use another email
                    </button>
                  </div>
                </form>
              ) : null}

              {view === "forgot-password" ? (
                <form onSubmit={onResetPassword} className="space-y-4">
                  <p className="text-sm leading-relaxed text-white/70">
                    At least 10 characters. Every other session on this account
                    is signed out.
                  </p>
                  <label className="block">
                    <span className={LABEL}>New password</span>
                    <input
                      type="password"
                      required
                      autoFocus
                      minLength={10}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className={INPUT}
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Confirm new password</span>
                    <input
                      type="password"
                      required
                      minLength={10}
                      autoComplete="new-password"
                      value={newPasswordConfirm}
                      onChange={(event) =>
                        setNewPasswordConfirm(event.target.value)
                      }
                      className={INPUT}
                    />
                  </label>
                  <SplitPillButton
                    label={submitting ? "Saving" : "Save the new password"}
                    type="submit"
                    className="w-full justify-center"
                  />
                </form>
              ) : null}

              {notice ? (
                <p className="mt-5 rounded-sm border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  {notice}
                </p>
              ) : null}
              {message ? (
                <p className="mt-5 rounded-sm border border-white/15 bg-[#0842BC]/40 px-4 py-3 text-sm text-[#9ec4ff]">
                  {message}
                </p>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
