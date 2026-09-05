"use client";

import { useEffect, useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

import { LandingProvider, useLanding } from "./landing-context";
import { Header } from "./mc/header";
import type { LandingContent } from "./types";

export type AuthMode = "login" | "register" | "forgot" | "update";

const COPY: Record<AuthMode, { kicker: string; title: string; subtitle: (name: string) => string }> = {
  login: {
    kicker: "Sign in",
    title: "Welcome back",
    subtitle: (name) => `Sign in to your ${name} dashboard.`,
  },
  register: {
    kicker: "Register",
    title: "Create your account",
    subtitle: (name) => `Register to open the ${name} console.`,
  },
  forgot: {
    kicker: "Reset",
    title: "Forgot password",
    subtitle: () => "Enter your email and we’ll send a reset link.",
  },
  update: {
    kicker: "Update",
    title: "Set a new password",
    subtitle: () => "Choose a password you’ll remember.",
  },
};

interface DotConfig {
  x: number;
  y: number;
  opacity: number;
  size: number;
}

function generateDots(count: number, seed: number): DotConfig[] {
  const dots: DotConfig[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i * 17 + seed) % 100;
    const y = (i * 23 + seed * 7) % 100;
    const opacity = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6][i % 7];
    const size = [2, 2, 3, 3, 4][i % 5];
    dots.push({ x, y, opacity, size });
  }
  return dots;
}

const fieldLabel = { color: "#d4d4d4" } as const;
const muted = { color: "#a1a1a1" } as const;
const subtle = { color: "#6b6b6b" } as const;
const bright = { color: "#fafafa" } as const;

function TextField({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="font-medium text-sm" style={fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        type={type ?? "text"}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mc-login-input"
      />
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
  autoComplete,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={label ? "space-y-2" : "relative"}>
      {label ? (
        <label htmlFor={id} className="font-medium text-sm" style={fieldLabel}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete ?? "current-password"}
          required
          minLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="mc-login-input pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 transition-colors"
          style={subtle}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#d4d4d4";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#6b6b6b";
          }}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function SubmitButton({ submitting, children }: { submitting: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl font-medium text-sm transition-all duration-200 disabled:pointer-events-none disabled:opacity-50"
      style={{ backgroundColor: "#fafafa", color: "#0a0a0a" }}
    >
      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="rounded-xl p-3 text-sm"
      style={{
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        color: "#ef4444",
      }}
    >
      {message}
    </div>
  );
}

function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="rounded-xl p-3 text-sm"
      style={{
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        border: "1px solid rgba(34, 197, 94, 0.25)",
        color: "#4ade80",
      }}
    >
      {message}
    </div>
  );
}

function signupErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit")) {
    return "Too many signup attempts for this project. Wait a few minutes, then try a new email.";
  }
  if (lower.includes("invalid api key") || lower.includes("invalid jwt")) {
    return "Supabase API key is missing or invalid. Set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local and restart the app.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "This email is already registered. Sign in instead.";
  }
  return message;
}

function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJustRegistered(params.get("registered") === "1");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        toast.error("Sign in failed", { description: signInError.message });
        return;
      }
      toast.success("Signed in");
      router.push(redirectTo);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-center text-[10px] uppercase tracking-[0.22em] lg:text-left" style={subtle}>
        Sign in
      </p>
      <FormNotice
        message={justRegistered ? "Account created. Confirm your email if asked, then sign in here." : null}
      />
      <FormError message={error} />
      <TextField
        id="login-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        disabled={submitting}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="login-password" className="font-medium text-sm" style={fieldLabel}>
            Password
          </label>
          <Link prefetch={false} href="/auth/v1/forgot-password" className="text-xs hover:underline" style={muted}>
            Forgot password?
          </Link>
        </div>
        <PasswordField id="login-password" value={password} onChange={setPassword} disabled={submitting} />
      </div>
      <SubmitButton submitting={submitting}>Sign in</SubmitButton>
      <p className="text-center text-sm" style={muted}>
        Don&apos;t have an account?{" "}
        <Link prefetch={false} href="/auth/v1/register" className="hover:underline" style={bright}>
          Create one
        </Link>
      </p>
    </form>
  );
}

function RegisterForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/v1/login`,
        },
      });
      if (signUpError) {
        const message = signupErrorMessage(signUpError.message);
        setError(message);
        toast.error("Registration failed", { description: message });
        return;
      }
      let session = data.session;
      if (!session) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (!signInError) session = signInData.session;
      }
      if (session) {
        toast.success("Account created");
        router.push(redirectTo);
        router.refresh();
      } else {
        toast.success("Account created", {
          description: "Confirm your email if asked, then sign in.",
        });
        router.push("/auth/v1/login?registered=1");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-center text-[10px] uppercase tracking-[0.22em] lg:text-left" style={subtle}>
        Register
      </p>
      <FormError message={error} />
      <TextField
        id="register-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        disabled={submitting}
      />
      <PasswordField
        id="register-password"
        label="Password"
        value={password}
        onChange={setPassword}
        disabled={submitting}
        autoComplete="new-password"
      />
      <PasswordField
        id="register-confirm"
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        disabled={submitting}
        autoComplete="new-password"
      />
      <SubmitButton submitting={submitting}>Create account</SubmitButton>
      <p className="text-center text-sm" style={muted}>
        Already have an account?{" "}
        <Link prefetch={false} href="/auth/v1/login" className="hover:underline" style={bright}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

function ForgotForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/v1/update-password`,
      });
      if (resetError) {
        setError(resetError.message);
        toast.error("Something went wrong", { description: resetError.message });
        return;
      }
      toast.success("Reset link sent", {
        description: "Check your email for a link to reset your password.",
      });
      setEmail("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-center text-[10px] uppercase tracking-[0.22em] lg:text-left" style={subtle}>
        Reset
      </p>
      <FormError message={error} />
      <TextField
        id="forgot-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        disabled={submitting}
      />
      <SubmitButton submitting={submitting}>Send reset link</SubmitButton>
      <p className="text-center text-sm" style={muted}>
        Remembered it?{" "}
        <Link prefetch={false} href="/auth/v1/login" className="hover:underline" style={bright}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

function UpdateForm() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        toast.error("Failed to update password", { description: updateError.message });
        return;
      }
      toast.success("Password updated");
      router.push("/auth/v1/login");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-center text-[10px] uppercase tracking-[0.22em] lg:text-left" style={subtle}>
        Update
      </p>
      <FormError message={error} />
      <PasswordField
        id="update-password"
        label="New password"
        value={password}
        onChange={setPassword}
        disabled={submitting}
        autoComplete="new-password"
      />
      <PasswordField
        id="update-confirm"
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        disabled={submitting}
        autoComplete="new-password"
      />
      <SubmitButton submitting={submitting}>Update password</SubmitButton>
      <p className="text-center text-sm" style={muted}>
        <Link prefetch={false} href="/auth/v1/login" className="hover:underline" style={bright}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

function AuthForm({ mode, redirectTo }: { mode: AuthMode; redirectTo: string }) {
  if (mode === "register") return <RegisterForm redirectTo={redirectTo} />;
  if (mode === "forgot") return <ForgotForm />;
  if (mode === "update") return <UpdateForm />;
  return <SignInForm redirectTo={redirectTo} />;
}

function LoginCard({ mode, redirectTo }: { mode: AuthMode; redirectTo: string }) {
  const content = useLanding();
  const bullets = content.features.slice(0, 3).map((f) => f.title);
  const copy = COPY[mode];

  return (
    <div className="relative w-full max-w-md animate-fade-in lg:max-w-5xl">
      <div className="relative">
        <div
          className="absolute -top-px -left-px h-24 w-32 rounded-2xl blur-[1px]"
          style={{
            background:
              "radial-gradient(ellipse at top left, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 30%, transparent 60%)",
          }}
        />
        <div
          className="absolute -right-px -bottom-px h-20 w-24 rounded-2xl blur-[1px]"
          style={{
            background:
              "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 30%, transparent 60%)",
          }}
        />

        <div
          className="relative grid overflow-hidden rounded-2xl border border-white/10 backdrop-blur-xl lg:grid-cols-[1.05fr_1fr]"
          style={{
            backgroundColor: "rgba(17, 17, 17, 0.8)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent" />

          <div
            className="relative hidden flex-col justify-between overflow-hidden border-white/10 border-r p-10 lg:flex"
            style={{
              background:
                "linear-gradient(155deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 45%, rgba(255,255,255,0) 100%)",
            }}
          >
            <div
              className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)",
                filter: "blur(20px)",
              }}
            />
            <div
              className="pointer-events-none absolute right-0 bottom-0 h-56 w-56 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)",
                filter: "blur(20px)",
              }}
            />

            <div className="relative">
              <div className="relative inline-flex">
                <div
                  className="absolute -top-[1px] -left-[1px] h-10 w-10 rounded-xl blur-[0.5px]"
                  style={{
                    background:
                      "radial-gradient(ellipse at top left, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 30%, transparent 60%)",
                  }}
                />
                <div
                  className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/15 backdrop-blur-sm"
                  style={{ backgroundColor: "rgba(17, 17, 17, 0.9)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                  <Image src="/sign.png" alt="" width={32} height={32} className="relative z-10 h-8 w-8" />
                </div>
              </div>

              <h2 className="mt-8 font-bold font-display text-3xl leading-tight tracking-tight" style={bright}>
                {content.headline}
                <br />
                {content.headlineMuted}
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed" style={muted}>
                {content.subhead}
              </p>
            </div>

            <div className="relative space-y-3">
              {bullets.map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-sm" style={{ color: "#d4d4d4" }}>
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#86efac" }} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative p-6 sm:p-8 lg:p-10">
            <div className="mb-6 text-center lg:hidden">
              <div className="mb-4 flex justify-center">
                <div className="relative">
                  <div
                    className="absolute -top-[1px] -left-[1px] h-10 w-10 rounded-xl blur-[0.5px]"
                    style={{
                      background:
                        "radial-gradient(ellipse at top left, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 30%, transparent 60%)",
                    }}
                  />
                  <div
                    className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-white/15 backdrop-blur-sm"
                    style={{ backgroundColor: "rgba(17, 17, 17, 0.9)" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                    <Image src="/sign.png" alt="" width={36} height={36} className="relative z-10 h-9 w-9" />
                  </div>
                </div>
              </div>
              <h1 className="font-bold font-display text-xl tracking-tight" style={bright}>
                {copy.title}
              </h1>
            </div>

            <div className="mb-6 hidden lg:block">
              <h1 className="font-semibold text-xl tracking-tight" style={bright}>
                {copy.title}
              </h1>
              <p className="mt-1 text-sm" style={muted}>
                {copy.subtitle(content.name)}
              </p>
            </div>

            <AuthForm mode={mode} redirectTo={redirectTo} />

            <p className="mt-6 text-center text-xs lg:text-left" style={subtle}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginShell({ mode, redirectTo }: { mode: AuthMode; redirectTo: string }) {
  const leftDots = useMemo(() => generateDots(25, 42), []);
  const rightDots = useMemo(() => generateDots(25, 73), []);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-6 lg:p-8"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      <div className="pointer-events-none absolute top-0 left-0 h-[300px] w-[300px] sm:h-[400px] sm:w-[400px]">
        <div className="relative h-full w-full">
          {leftDots.map((dot, i) => (
            <div
              key={`left-${i}`}
              className="absolute rounded-full bg-white"
              style={{
                left: `${dot.x}%`,
                top: `${dot.y}%`,
                width: `${dot.size}px`,
                height: `${dot.size}px`,
                opacity: dot.opacity,
                boxShadow: `0 0 ${dot.size * 3}px ${dot.size}px rgba(255, 255, 255, ${dot.opacity * 0.5})`,
              }}
            />
          ))}
        </div>
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom right, transparent, transparent, #0a0a0a)",
          }}
        />
      </div>

      <div className="pointer-events-none absolute top-0 right-0 h-[300px] w-[300px] sm:h-[400px] sm:w-[400px]">
        <div className="relative h-full w-full">
          {rightDots.map((dot, i) => (
            <div
              key={`right-${i}`}
              className="absolute rounded-full bg-white"
              style={{
                left: `${dot.x}%`,
                top: `${dot.y}%`,
                width: `${dot.size}px`,
                height: `${dot.size}px`,
                opacity: dot.opacity,
                boxShadow: `0 0 ${dot.size * 3}px ${dot.size}px rgba(255, 255, 255, ${dot.opacity * 0.5})`,
              }}
            />
          ))}
        </div>
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom left, transparent, transparent, #0a0a0a)",
          }}
        />
      </div>

      <LoginCard mode={mode} redirectTo={redirectTo} />
    </div>
  );
}

export function McLoginView({
  content,
  redirectTo,
  mode = "login",
}: {
  content: LandingContent;
  redirectTo: string;
  mode?: AuthMode;
}) {
  return (
    <LandingProvider content={content}>
      <Header />
      <LoginShell mode={mode} redirectTo={redirectTo} />
    </LandingProvider>
  );
}
