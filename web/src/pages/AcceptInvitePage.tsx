import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import SiteHeader from "../components/SiteHeader";
import FiberField from "../components/ui/FiberField";
import SplitPillButton from "../components/ui/SplitPillButton";
import { acceptInvite } from "../lib/auth";

const INPUT =
  "h-12 w-full rounded-sm border border-white/15 bg-white/5 px-5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7EB0FF] focus:ring-2 focus:ring-white/20";

const LABEL =
  "mb-2 block font-mono text-[11px] tracking-widest text-white/50 uppercase";

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenFromUrl = params.get("token")?.trim() ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (password !== passwordConfirm) {
      setMessage("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await acceptInvite(token, password, passwordConfirm);
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
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-8 sm:px-5">
        <div className="w-full rounded-sm border border-white/15 bg-[#0839B0]/80 p-6 md:p-8">
          <p className="font-mono text-[11px] tracking-widest text-white/45 uppercase">
            Activation
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Set your password.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Choose a password of at least 10 characters. Your invitation works
            once.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {tokenFromUrl ? null : (
              <label className="block">
                <span className={LABEL}>Invitation code</span>
                <input
                  required
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  className={`${INPUT} font-mono tracking-wider uppercase`}
                />
              </label>
            )}
            <label className="block">
              <span className={LABEL}>Password</span>
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Confirm password</span>
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                className={INPUT}
              />
            </label>
            {message ? (
              <p className="text-sm text-[#9ec4ff]">{message}</p>
            ) : null}
            <SplitPillButton
              label={submitting ? "Activating" : "Activate account"}
              type="submit"
              className="w-full justify-center"
            />
          </form>
          <p className="mt-6 text-sm text-white/55">
            Already active?{" "}
            <Link
              to="/console/login"
              className="font-medium text-white underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
