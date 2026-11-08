"use client";
import React, { useState, useId } from "react";
import {
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { btnCls, btnSecondary, inputCls, Badge, useToast } from "@/components/ui";
import { useAuth } from "@/context/auth";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * If provided, administrator is resetting this target user's password.
   * If null/undefined, current authenticated user is changing their own password.
   */
  targetUser?: {
    email: string;
    fullName: string;
    role?: string;
  } | null;
}

const PASSPHRASE_WORDS = [
  "Umeed", "Factor", "Hemophilia", "Shield", "Care", "Falcon", "Echo",
  "Atlas", "River", "Summit", "Beacon", "Cure", "Hope", "Pulse", "Vial",
  "Genesis", "Alpha", "Zenith", "Horizon", "Purity", "Vital", "Rescue"
];

function generateMemorablePassphrase(): string {
  const w1 = PASSPHRASE_WORDS[Math.floor(Math.random() * PASSPHRASE_WORDS.length)];
  const w2 = PASSPHRASE_WORDS[Math.floor(Math.random() * PASSPHRASE_WORDS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  const syms = ["!", "@", "#", "$", "*"];
  const sym = syms[Math.floor(Math.random() * syms.length)];
  return `${w1}-${w2}-${num}${sym}`;
}

function calculateStrength(pw: string): {
  score: number;
  label: "Very Weak" | "Weak" | "Fair" | "Strong" | "Very Strong";
  color: string;
  feedback: string;
} {
  if (!pw) return { score: 0, label: "Very Weak", color: "bg-slate-300", feedback: "Enter password" };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-rose-500", feedback: "Too simple (minimum 6 chars)" };
  if (score === 2) return { score: 2, label: "Fair", color: "bg-amber-500", feedback: "Add uppercase, numbers, or symbols" };
  if (score === 3 || score === 4) return { score: 3, label: "Strong", color: "bg-emerald-500", feedback: "Good security passphrase" };
  return { score: 4, label: "Very Strong", color: "bg-emerald-600", feedback: "Excellent memorable security phrase" };
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  targetUser,
}: ChangePasswordModalProps) {
  const { user, changePassword, resetUserPassword } = useAuth();
  const { addToast } = useToast();

  const isSelf = !targetUser || targetUser.email.toLowerCase() === user?.email.toLowerCase();
  const title = isSelf ? "Change Your Password" : `Reset Password: ${targetUser?.fullName || targetUser?.email}`;

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const strength = calculateStrength(newPw);

  const handleGenerate = () => {
    const generated = generateMemorablePassphrase();
    setNewPw(generated);
    setConfirmPw(generated);
    setShowNew(true);
    setShowConfirm(true);
    setError("");
  };

  const handleCopy = () => {
    if (!newPw) return;
    navigator.clipboard.writeText(newPw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast("info", "Copied", "Passphrase copied to clipboard.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isSelf && !currentPw.trim()) {
      setError("Please provide your current password.");
      return;
    }

    if (!newPw || newPw.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (newPw !== confirmPw) {
      setError("New password and confirm password do not match.");
      return;
    }

    setLoading(true);

    let res: { success: boolean; error?: string };
    if (isSelf) {
      res = await changePassword(newPw, currentPw);
    } else {
      res = await resetUserPassword(targetUser!.email, newPw);
    }

    setLoading(false);

    if (res.success) {
      addToast(
        "success",
        "Password Updated",
        isSelf
          ? "Your credentials have been securely updated."
          : `Credentials reset successfully for ${targetUser?.fullName || targetUser?.email}.`
      );
      // Reset form & close
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      onClose();
    } else {
      setError(res.error || "Failed to update password. Please check your credentials.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg neu-card p-6 border border-white/60 dark:border-[#54194c]/60 shadow-2xl relative animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/60 dark:border-[#38163f]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl neu-inset bg-[#3A0F34] dark:bg-[#54194c] text-[#EAAA00] flex items-center justify-center flex-shrink-0">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#bdaec2]">
                {isSelf
                  ? `Logged in as ${user?.name || user?.email}`
                  : `Administrator password override for ${targetUser?.email}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl neu-btn text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Current Password (only for self) */}
          {isSelf && (
            <div>
              <label className="text-xs font-bold text-[#3A0F34] dark:text-[#f6f1f7] block mb-1.5">
                Current Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="Enter current password"
                  className={inputCls}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          )}

          {/* New Password / Passphrase */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
                {isSelf ? "New Password / Passphrase" : "New Account Password"} <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#EAAA00] hover:text-[#b88500] cursor-pointer transition-colors"
                title="Generate secure memorable words passphrase"
              >
                <Sparkles size={12} />
                <span>Generate Words Phrase</span>
              </button>
            </div>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="Enter strong password (min 6 characters)"
                className={inputCls}
                required
              />
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {newPw && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-slate-400 hover:text-[#EAAA00] cursor-pointer"
                    title="Copy phrase"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Passphrase Words & Strength Helper */}
            {newPw && (
              <div className="mt-2 neu-inset p-2.5 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">Phrase Strength:</span>
                  <span className="font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
                    {strength.label}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-[#2b122f] rounded-full overflow-hidden flex gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full flex-1 transition-all duration-300 rounded-full ${
                        step <= strength.score ? strength.color : "bg-transparent"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#bdaec2]">
                  {strength.feedback}
                </p>
              </div>
            )}
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="text-xs font-bold text-[#3A0F34] dark:text-[#f6f1f7] block mb-1.5">
              Confirm New Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Re-enter new password to verify"
                className={inputCls}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {newPw && confirmPw && (
              <p className={`text-[11px] mt-1 font-semibold ${newPw === confirmPw ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                {newPw === confirmPw ? "✓ Passwords match" : "✕ Passwords do not match"}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 neu-inset px-3 py-2.5 rounded-xl">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Security Notice */}
          <div className="neu-inset p-3 rounded-xl flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck size={14} className="text-emerald-500 flex-shrink-0" />
            <span>
              Updated passwords are encrypted and synchronized across database authentication tables.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/60 dark:border-[#38163f]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={btnSecondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (!!newPw && newPw !== confirmPw)}
              className={`${btnCls} flex items-center gap-2`}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>{isSelf ? "Update My Password" : "Save User Password"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

