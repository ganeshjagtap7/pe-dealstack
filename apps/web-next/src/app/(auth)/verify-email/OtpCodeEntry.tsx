"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const DIGIT_COUNT = 6;
const RESEND_COOLDOWN = 60; // seconds

interface OtpCodeEntryProps {
  initialEmail: string;
  hasPrefilledEmail: boolean;
  onVerified: () => void;
}

export default function OtpCodeEntry({
  initialEmail,
  hasPrefilledEmail,
  onVerified,
}: OtpCodeEntryProps) {
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Resend state
  const [resendCooldown, setResendCooldown] = useState(0);
  const [email, setEmail] = useState(initialEmail);
  const [resendMessage, setResendMessage] = useState("");
  const [resendMessageType, setResendMessageType] = useState<"success" | "error">("error");
  const [resendLoading, setResendLoading] = useState(false);

  /* ---- Resend cooldown ticker ---- */
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  /* ---- OTP digit handlers ---- */
  const handleDigitChange = useCallback((index: number, raw: string) => {
    const val = raw.replace(/[^0-9]/g, "").slice(0, 1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
    setCodeError("");
    if (val && index < DIGIT_COUNT - 1) inputRefs.current[index + 1]?.focus();
  }, []);

  const handleDigitKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
      }
    },
    [digits]
  );

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text") || "")
      .replace(/[^0-9]/g, "")
      .slice(0, DIGIT_COUNT);
    if (!pasted) return;
    const next = Array(DIGIT_COUNT)
      .fill("")
      .map((_, i) => pasted[i] ?? "");
    setDigits(next);
    setCodeError("");
    if (pasted.length === DIGIT_COUNT) inputRefs.current[DIGIT_COUNT - 1]?.focus();
  }, []);

  /* ---- Submit OTP code ---- */
  const handleVerifyCode = useCallback(async () => {
    const code = digits.join("");
    if (code.length !== DIGIT_COUNT) return;

    setVerifying(true);
    setCodeError("");

    try {
      const supabase = createClient();
      if (!email) {
        setCodeError("No email address found. Please enter your email and resend the code.");
        setVerifying(false);
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });

      if (error) {
        setCodeError("Invalid or expired code. Please try again.");
        setDigits(Array(DIGIT_COUNT).fill(""));
        inputRefs.current[0]?.focus();
        setVerifying(false);
        return;
      }

      onVerified();
    } catch {
      setCodeError("An error occurred. Please try again.");
    } finally {
      setVerifying(false);
    }
  }, [digits, email, onVerified]);

  /* ---- Auto-submit when all 6 digits filled ---- */
  useEffect(() => {
    if (digits.join("").length === DIGIT_COUNT && !verifying) {
      handleVerifyCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  /* ---- Resend verification email ---- */
  const handleResend = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setResendMessage("Please enter your email address.");
      setResendMessageType("error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setResendMessage("Please enter a valid email address.");
      setResendMessageType("error");
      return;
    }

    setResendLoading(true);
    setResendMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({ type: "signup", email: trimmed });

      if (error) {
        setResendMessage(error.message || "Failed to send verification email.");
        setResendMessageType("error");
      } else {
        setResendMessage("Verification email sent! Check your inbox.");
        setResendMessageType("success");
        setResendCooldown(RESEND_COOLDOWN);
      }
    } catch {
      setResendMessage("An error occurred. Please try again.");
      setResendMessageType("error");
    } finally {
      setResendLoading(false);
    }
  }, [email]);

  return (
    <div className="w-full max-w-[440px] bg-white rounded-xl shadow-sm border border-border-subtle p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary">mail</span>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-text-main mb-2">Check your email</h1>
      <p className="text-text-muted text-sm mb-6 max-w-sm mx-auto">
        We&apos;ve sent a verification code to your email address. Enter the 6-digit code below to
        verify your account.
      </p>

      {/* Email input -- shown when no pre-filled email from session */}
      {!hasPrefilledEmail && (
        <div className="mb-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email to verify"
            className="w-full rounded-lg border border-border-subtle px-4 py-2.5 text-sm text-center focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
      )}
      {hasPrefilledEmail && email && (
        <p className="text-text-muted text-xs mb-4">
          Code sent to <span className="font-medium text-text-secondary">{email}</span>
        </p>
      )}

      {/* 6-digit code inputs */}
      <div className="flex justify-center gap-2 mb-5">
        {digits.map((digit, i) => (
          <div key={i} className="flex items-center">
            <input
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : undefined}
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleDigitKeyDown(i, e)}
              onPaste={handlePaste}
              className="w-12 h-14 text-center text-xl font-bold border border-border-subtle rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
            {i === 2 && (
              <span className="ml-2 flex items-center text-gray-300 text-xl">-</span>
            )}
          </div>
        ))}
      </div>

      {/* Code error */}
      {codeError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
          {codeError}
        </div>
      )}

      {/* Verify button */}
      <button
        onClick={handleVerifyCode}
        disabled={digits.join("").length !== DIGIT_COUNT || verifying}
        className="w-full h-12 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 flex items-center justify-center gap-2 mb-4"
        style={{ backgroundColor: "#003366" }}
      >
        {verifying ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Verifying...
          </span>
        ) : (
          "Verify Email"
        )}
      </button>

      {/* Resend */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-text-muted">Didn&apos;t receive the code?</p>
        <button
          onClick={handleResend}
          disabled={resendLoading || resendCooldown > 0}
          className="text-sm font-medium text-primary hover:text-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resendLoading
            ? "Sending..."
            : resendCooldown > 0
              ? `Resend code (${resendCooldown}s)`
              : "Resend verification email"}
        </button>
        {resendMessage && (
          <p
            className={`text-sm ${
              resendMessageType === "success" ? "text-green-600" : "text-red-500"
            }`}
          >
            {resendMessage}
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-text-muted">or</span>
        </div>
      </div>

      {/* Go to Login */}
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-1.5 w-full py-3 rounded-lg border border-border-subtle text-text-secondary font-medium text-sm hover:bg-gray-50 transition-colors"
      >
        Go to Sign In
      </Link>
    </div>
  );
}
