"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center overflow-hidden" style={{ backgroundColor: "#003366" }}>
        {/* Dot pattern */}
        <div
          className="absolute inset-0 z-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(#ffffff 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#003366] via-transparent to-white/10 z-0" />

        <div className="relative z-10 flex flex-col items-center w-full px-12">
          {/* Dashboard preview card */}
          <div className="w-full max-w-2xl relative">
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-400/30 to-purple-300/20 rounded-xl blur-xl opacity-40" />
            <div className="relative rounded-xl overflow-hidden shadow-2xl border border-white/20 bg-gray-900">
              <div className="h-8 bg-gray-800/80 backdrop-blur border-b border-white/10 flex items-center px-4 space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="aspect-[16/9] w-full bg-gradient-to-br from-[#335C85] to-[#002855] flex items-center justify-center">
                <div className="text-center text-white/60">
                  <Logo className="size-16 mx-auto mb-4 text-white/40" />
                  <p className="text-sm">Deal Pipeline Dashboard</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tagline */}
          <div className="mt-12 text-center space-y-3">
            <h2 className="text-3xl font-semibold text-white tracking-tight">
              The Operating System for Modern Capital
            </h2>
            <p className="text-blue-100/80 text-base max-w-md mx-auto leading-relaxed">
              Unified intelligence for private equity. Streamline your deal flow and portfolio
              monitoring in one secure environment.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-white px-6 md:px-12 lg:px-24 relative">
        <div className="absolute inset-0 lg:hidden pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent" />

        <div className="w-full max-w-[440px] z-10">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-10">
            <Logo className="size-8 text-primary" />
            <span className="text-xl font-bold tracking-tight text-primary">PE OS</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-[#121417] tracking-tight text-[28px] font-bold leading-tight mb-2">
              Sign in to your account
            </h1>
            <p className="text-slate-500 text-sm">Welcome back! Please enter your details.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <p className="text-[#121417] text-sm font-medium">Business Email</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="form-input w-full rounded-lg text-[#121417] border border-gray-200 bg-white h-12 placeholder:text-gray-400 px-4 text-sm transition-all focus:outline-0 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="name@firm.com"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <p className="text-[#121417] text-sm font-medium">Password</p>
              <div className="relative flex w-full rounded-lg group focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary border border-gray-200 bg-white transition-all">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input flex-1 min-w-0 border-none bg-transparent h-12 text-[#121417] placeholder:text-gray-400 px-4 text-sm focus:ring-0"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="pr-3 flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? "visibility" : "visibility_off"}
                  </span>
                </button>
              </div>
            </label>

            {/* Remember + Forgot */}
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary/20 w-4 h-4"
                />
                <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">
                  Remember me
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-primary hover:text-blue-700 text-sm font-medium transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Sign In */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg text-white font-semibold text-sm transition-all disabled:opacity-60 hover:opacity-90"
              style={{ backgroundColor: "#003366" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 my-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 uppercase">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <p className="text-center text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary font-medium hover:underline">
                Create one now
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
