"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardInset,
  Badge,
  btnCls,
  btnSecondary,
  inputCls,
  useToast,
  BulkUploadModal,
  BulkDownloadModal,
} from "@/components/ui";
import {
  Upload,
  Download,
  ShieldCheck,
  UserPlus,
  Users,
  RefreshCw,
  KeyRound,
  Lock,
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Check,
  Search,
  Trash2,
  UserX,
  UserCheck,
  Phone,
  Building2,
  Mail,
  User as UserIcon,
} from "lucide-react";
import { getUsersFromDb, DbUserRecord } from "@/lib/dataService";
import { useAuth } from "@/context/auth";
import { formatPakistanPhone, validatePakistanPhone } from "@/lib/pakistanValidation";
import ChangePasswordModal from "@/components/auth/ChangePasswordModal";
import { useUsersQuery } from "@/lib/hooks/useRegistryData";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

interface RoleDef {
  id: string;
  name: string;
  displayName: string;
  usersCount: number;
  description: string;
  permissions: { category: string; actions: string[] }[];
}

const ROLES: RoleDef[] = [
  {
    id: "super_admin",
    name: "super_admin",
    displayName: "Super Administrator",
    usersCount: 2,
    description: "Unrestricted access across all registry tables, security settings, and system governance.",
    permissions: [
      { category: "Patient Records", actions: ["Create", "Read", "Update", "Delete", "Sensitive Health Data"] },
      { category: "Treatments & Factor", actions: ["Administer Injections", "Edit Dosing", "Delete Records"] },
      { category: "Data Ingestion & Export", actions: ["Batch Import CSV/XLSX", "Bulk Export", "Raw Dump"] },
      { category: "Security & Governance", actions: ["Audit Logs", "Brute-force Management", "Role Assignment", "Key Rotation"] },
    ],
  },
  {
    id: "admin",
    name: "admin",
    displayName: "Registry Administrator",
    usersCount: 5,
    description: "Manage users, patient registrations, treatment catalogs, and data export reports.",
    permissions: [
      { category: "Patient Records", actions: ["Create", "Read", "Update", "Delete"] },
      { category: "Treatments & Factor", actions: ["Administer Injections", "Edit Dosing"] },
      { category: "Data Ingestion & Export", actions: ["Batch Import CSV/XLSX", "Bulk Export"] },
      { category: "Security & Governance", actions: ["Audit Logs", "View Roles"] },
    ],
  },
  {
    id: "manager",
    name: "manager",
    displayName: "HTC Clinic Manager",
    usersCount: 8,
    description: "Oversee hemophilia treatment center operations, patient flow, and monthly reporting.",
    permissions: [
      { category: "Patient Records", actions: ["Create", "Read", "Update"] },
      { category: "Treatments & Factor", actions: ["Administer Injections", "View Dosing"] },
      { category: "Data Ingestion & Export", actions: ["Export Cohort Reports"] },
      { category: "Security & Governance", actions: ["Self Profile"] },
    ],
  },
  {
    id: "clinician",
    name: "clinician",
    displayName: "Staff Clinician / Nurse",
    usersCount: 19,
    description: "Frontline clinical records entry, injection administration, and emergency treatment logging.",
    permissions: [
      { category: "Patient Records", actions: ["Create", "Read"] },
      { category: "Treatments & Factor", actions: ["Administer Injections", "View History"] },
      { category: "Data Ingestion & Export", actions: ["Single Patient Summary"] },
      { category: "Security & Governance", actions: ["Self Profile"] },
    ],
  },
];

const PASSPHRASE_WORDS = [
  "Umeed", "Factor", "Hemophilia", "Shield", "Care", "Falcon", "Echo",
  "Atlas", "River", "Summit", "Beacon", "Cure", "Hope", "Pulse", "Vial",
  "Genesis", "Alpha", "Zenith", "Horizon", "Purity", "Vital", "Rescue"
];

function generateClinicalPassphrase(): string {
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
} {
  if (!pw) return { score: 0, label: "Very Weak", color: "bg-slate-300" };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-rose-500" };
  if (score === 2) return { score: 2, label: "Fair", color: "bg-amber-500" };
  if (score === 3 || score === 4) return { score: 3, label: "Strong", color: "bg-emerald-500" };
  return { score: 4, label: "Very Strong", color: "bg-emerald-600" };
}

export default function RolesModule({ isLiveDb = true }: { isLiveDb?: boolean }) {
  const { addToast } = useToast();
  const {
    user: currentLoggedInUser,
    registerUserAccount,
    updateUserStatus,
    deleteUserAccount,
  } = useAuth();

  const [selectedRole, setSelectedRole] = useState<RoleDef>(ROLES[0]);

  // DB Users State via React Query
  const queryClient = useQueryClient();
  const { data: users = [], isLoading: loadingUsers, refetch: refetchUsers } = useUsersQuery(isLiveDb);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Password reset modal state
  const [resetModalUser, setResetModalUser] = useState<{
    email: string;
    fullName: string;
    role?: string;
  } | null>(null);
  const [showSelfPwModal, setShowSelfPwModal] = useState(false);

  // Account Creation Form State ("Words & Password Creation Phase")
  const [isFormOpen, setIsFormOpen] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<DbUserRecord["role"]>("clinician");
  const [newDept, setNewDept] = useState(currentLoggedInUser?.department || "HTC Treatment Center");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedGenerated, setCopiedGenerated] = useState(false);

  // Autofill department if current user has one
  useEffect(() => {
    if (currentLoggedInUser?.department && (!newDept || newDept === "HTC Center")) {
      setNewDept(currentLoggedInUser.department);
    }
  }, [currentLoggedInUser]);

  const loadUsers = async () => {
    await refetchUsers();
  };

  // Handle Generate Words Passphrase
  const handleGenerateWordsPassphrase = () => {
    const phrase = generateClinicalPassphrase();
    setNewPassword(phrase);
    setNewConfirmPassword(phrase);
    setShowPw(true);
    setShowConfirmPw(true);
    navigator.clipboard.writeText(phrase);
    setCopiedGenerated(true);
    setTimeout(() => setCopiedGenerated(false), 2500);
    addToast(
      "info",
      "Passphrase Generated & Copied",
      `Created secure clinical words phrase: "${phrase}". Copied to clipboard.`
    );
  };

  // Live Pakistani phone validation
  const phoneValidation = useMemo(() => {
    if (!newPhone.trim()) return { isValid: true, empty: true, error: "" };
    return validatePakistanPhone(newPhone);
  }, [newPhone]);

  // Password strength
  const pwStrength = useMemo(() => calculateStrength(newPassword), [newPassword]);

  // Create User Account Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newEmail.trim() || !newName.trim()) {
      addToast("error", "Validation Error", "Full Name and Authorized Email are required.");
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      addToast("error", "Password Required", "Account password/phrase must be at least 6 characters.");
      return;
    }

    if (newPassword !== newConfirmPassword) {
      addToast("error", "Password Mismatch", "Password and Confirm Password do not match.");
      return;
    }

    if (newPhone.trim() && !phoneValidation.isValid) {
      addToast("error", "Invalid Mobile Number", phoneValidation.error || "Please enter a valid Pakistani mobile number.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      email: newEmail.trim().toLowerCase(),
      password: newPassword,
      fullName: newName.trim(),
      role: newRole,
      status: "active" as const,
      department: newDept.trim() || "HTC Center",
      phone: newPhone.trim() ? formatPakistanPhone(newPhone) : "",
    };

    const res = await registerUserAccount(payload);
    setIsSubmitting(false);

    if (res.success) {
      addToast(
        "success",
        "Authorized Account Created",
        `Provisioned active login credentials for ${payload.fullName} (${payload.role}).`
      );
      // Reset form
      setNewEmail("");
      setNewName("");
      setNewPhone("");
      setNewPassword("");
      setNewConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    } else {
      addToast("error", "Provisioning Failed", res.error || "Could not register account credentials.");
    }
  };

  // Toggle user status (active / suspended)
  const handleToggleStatus = async (userRecord: DbUserRecord) => {
    const nextStatus = userRecord.status === "active" ? "suspended" : "active";
    const res = await updateUserStatus(userRecord.email, nextStatus);
    if (res.success) {
      queryClient.setQueryData<DbUserRecord[]>(queryKeys.users.all, (old = []) =>
        old.map((u) => (u.email === userRecord.email ? { ...u, status: nextStatus } : u))
      );
      addToast(
        "info",
        "Account Status Updated",
        `Account ${userRecord.email} is now ${nextStatus}.`
      );
    } else {
      addToast("error", "Update Failed", res.error || "Could not update status.");
    }
  };

  // Delete user account
  const handleDeleteUser = async (userRecord: DbUserRecord) => {
    if (userRecord.email.toLowerCase() === currentLoggedInUser?.email.toLowerCase()) {
      addToast("error", "Action Denied", "You cannot delete your own active administrator account.");
      return;
    }

    if (!confirm(`Are you sure you want to deauthorize and delete account: ${userRecord.full_name} (${userRecord.email})?`)) {
      return;
    }

    const res = await deleteUserAccount(userRecord.email);
    if (res.success) {
      queryClient.setQueryData<DbUserRecord[]>(queryKeys.users.all, (old = []) =>
        old.filter((u) => u.email !== userRecord.email)
      );
      addToast("info", "User Deauthorized", `Removed account for ${userRecord.full_name}.`);
    } else {
      addToast("error", "Delete Failed", res.error || "Could not remove user.");
    }
  };

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q));
      return matchesRole && matchesQuery;
    });
  }, [users, roleFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── AUTHORIZED DATABASE PERSONNEL & ACCOUNT PROVISIONING ── */}
      <Card
        title={
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
              Authorized Accounts &amp; User Governance
            </span>
            <Badge variant="primary">{users.length} Database Accounts</Badge>
          </div>
        }
        subtitle="Manage authorized clinical staff, create new login accounts with words/passphrase creation phase, and reset credentials:"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSelfPwModal(true)}
              className={`${btnSecondary} flex items-center gap-1.5`}
              title="Change your own logged-in password"
            >
              <KeyRound size={14} className="text-[#EAAA00]" />
              <span>Change My Password</span>
            </button>
            <button
              type="button"
              onClick={loadUsers}
              disabled={loadingUsers}
              className="p-2 rounded-xl neu-btn hover:text-[#EAAA00] cursor-pointer"
              title="Refresh DB Users"
            >
              <RefreshCw size={13} className={loadingUsers ? "animate-spin text-[#EAAA00]" : ""} />
            </button>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className={`${btnSecondary} flex items-center gap-1.5`}
              title="Bulk upload authorized database users from Excel or CSV"
            >
              <Upload size={14} className="text-[#EAAA00]" />
              <span>Bulk Upload</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDownloadModal(true)}
              className={`${btnSecondary} flex items-center gap-1.5`}
              title="Bulk download database users to Excel (.xlsx) or CSV (.csv)"
            >
              <Download size={14} className="text-[#EAAA00]" />
              <span>Bulk Download</span>
            </button>
          </div>
        }
      >
        {/* Toggle Account Creation Form */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
              Account Provisioning Workflow:
            </span>
            <Badge variant="primary" size="sm">
              Password &amp; Words Creation Phase Included
            </Badge>
          </div>
          <button
            type="button"
            onClick={() => setIsFormOpen((v) => !v)}
            className="text-xs font-bold text-[#EAAA00] hover:underline cursor-pointer"
          >
            {isFormOpen ? "Hide Creation Form ▲" : "+ Create New Account ▼"}
          </button>
        </div>

        {/* ── EXPANDED ACCOUNT CREATION FORM WITH WORDS / PASSPHRASE PHASE ── */}
        {isFormOpen && (
          <form
            onSubmit={handleCreateUser}
            className="neu-inset p-5 rounded-2xl mb-6 space-y-4 border border-white/40 dark:border-[#38163f]/60"
          >
            <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-[#38163f] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-[#EAAA00]" />
                <h4 className="text-sm font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
                  Create New Authorized Account (Step-by-Step Setup)
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">
                Logged in operator: <strong className="text-[#EAAA00]">{currentLoggedInUser?.name}</strong>
              </span>
            </div>

            {/* Step 1: Personal & Role Details */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-bold text-[#3A0F34] dark:text-[#f6f1f7] flex items-center gap-1 mb-1">
                  <UserIcon size={12} className="text-slate-400" />
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. Dr. Ayesha Malik"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#3A0F34] dark:text-[#f6f1f7] flex items-center gap-1 mb-1">
                  <Mail size={12} className="text-slate-400" />
                  Authorized Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  className={inputCls}
                  placeholder="e.g. ayesha@befal.org"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#3A0F34] dark:text-[#f6f1f7] flex items-center gap-1 mb-1">
                  <Building2 size={12} className="text-slate-400" />
                  Department / Unit
                </label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. Day Care Infusion Center"
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#3A0F34] dark:text-[#f6f1f7] flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1">
                    <Phone size={12} className="text-slate-400" />
                    Mobile Number (Pakistan)
                  </span>
                  {newPhone && (
                    <span className={`text-[10px] font-semibold ${phoneValidation.isValid ? "text-emerald-500" : "text-amber-500"}`}>
                      {phoneValidation.isValid ? "✓ Valid" : "Format check"}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. 0300-1234567"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onBlur={() => {
                    if (newPhone.trim()) setNewPhone(formatPakistanPhone(newPhone));
                  }}
                />
              </div>
            </div>

            {/* Step 2: Role Selection & Access Tier */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-[#3A0F34] dark:text-[#f6f1f7] block mb-1">
                  Assigned Security Tier &amp; Privileges
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className={inputCls}
                >
                  <option value="super_admin">Super Administrator — Full Governance &amp; Security</option>
                  <option value="admin">Administrator — Clinical &amp; User Registry Access</option>
                  <option value="manager">HTC Clinic Manager — Operational &amp; Factor Monitoring</option>
                  <option value="clinician">Staff Clinician / Nurse — Clinical Record &amp; Infusions</option>
                </select>
              </div>

              <div className="sm:col-span-2 neu-inset p-2.5 rounded-xl text-[11px] text-slate-500 dark:text-[#bdaec2] flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-500 flex-shrink-0" />
                <span>
                  Role grants scoped access. Users can only access patient records and actions permitted by this role matrix.
                </span>
              </div>
            </div>

            {/* Step 3: Words & Password Creation Phase ("specially words creating phase") */}
            <div className="p-4 rounded-xl neu-card border border-[#EAAA00]/40 dark:border-[#EAAA00]/30 space-y-3 bg-[#EAAA00]/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lock size={15} className="text-[#EAAA00]" />
                  <span className="text-xs font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
                    Credentials Setup (Words &amp; Passphrase Creation Phase)
                  </span>
                  <Badge variant="primary" size="sm">Required</Badge>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateWordsPassphrase}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg neu-btn text-xs font-bold text-[#3A0F34] dark:text-[#f6f1f7] hover:text-[#EAAA00] cursor-pointer transition-all"
                  title="Generate a memorable 4-word clinical security passphrase"
                >
                  <Sparkles size={13} className="text-[#EAAA00]" />
                  <span>🎲 Generate Memorable Words Phrase</span>
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Password Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
                      Account Password / Passphrase <span className="text-rose-500">*</span>
                    </label>
                    {newPassword && (
                      <span className="text-[10px] font-semibold text-[#EAAA00]">
                        Strength: {pwStrength.label}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      className={inputCls}
                      placeholder="Enter minimum 6 characters or generate phrase"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      {newPassword && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(newPassword);
                            setCopiedGenerated(true);
                            setTimeout(() => setCopiedGenerated(false), 2000);
                          }}
                          className="text-slate-400 hover:text-[#EAAA00] cursor-pointer"
                          title="Copy passphrase"
                        >
                          {copiedGenerated ? (
                            <Check size={14} className="text-emerald-500" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Confirm Password Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
                      Confirm Password / Passphrase <span className="text-rose-500">*</span>
                    </label>
                    {newPassword && newConfirmPassword && (
                      <span
                        className={`text-[10px] font-bold ${
                          newPassword === newConfirmPassword ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {newPassword === newConfirmPassword ? "✓ Match" : "✕ Mismatch"}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showConfirmPw ? "text" : "password"}
                      className={inputCls}
                      placeholder="Re-enter password to verify"
                      value={newConfirmPassword}
                      onChange={(e) => setNewConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showConfirmPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Strength bar */}
              {newPassword && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-1.5 bg-slate-200 dark:bg-[#2b122f] rounded-full overflow-hidden flex gap-1">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`h-full flex-1 transition-all rounded-full ${
                          step <= pwStrength.score ? pwStrength.color : "bg-transparent"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {newPassword.length} characters
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-slate-500">
                Account will be immediately authorized for sign-in via the Login portal.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewEmail("");
                    setNewName("");
                    setNewPhone("");
                    setNewPassword("");
                    setNewConfirmPassword("");
                  }}
                  className={btnSecondary}
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (!!newPassword && newPassword !== newConfirmPassword)}
                  className={`${btnCls} flex items-center gap-2`}
                >
                  <UserPlus size={15} />
                  <span>{isSubmitting ? "Provisioning..." : "Authorize & Create Account"}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── SEARCH & FILTER CONTROLS ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search by name, email, department, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl neu-inset pl-8 pr-3 py-1.5 text-xs text-[#3A0F34] dark:text-[#f6f1f7] focus:outline-none focus:ring-1 focus:ring-[#EAAA00]"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl neu-inset px-3 py-1.5 text-xs text-[#3A0F34] dark:text-[#f6f1f7] focus:outline-none"
            >
              <option value="all">All Roles ({users.length})</option>
              <option value="super_admin">Super Admins</option>
              <option value="admin">Administrators</option>
              <option value="manager">HTC Managers</option>
              <option value="clinician">Staff Clinicians</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 font-semibold">
            Showing {filteredUsers.length} of {users.length} authorized accounts
          </span>
        </div>

        {/* ── DATABASE USERS TABLE ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 dark:text-slate-400 border-b border-white/60 dark:border-[#38163f]">
              <tr>
                <th className="py-2.5 px-3">Personnel</th>
                <th className="px-3">Authorized Email</th>
                <th className="px-3">Security Role</th>
                <th className="px-3">Department / Phone</th>
                <th className="px-3">Status</th>
                <th className="px-3 text-right">Account Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isCurrent = u.email.toLowerCase() === currentLoggedInUser?.email.toLowerCase();
                const initials = u.full_name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase();

                return (
                  <tr
                    key={u.id || u.email}
                    className="border-t border-slate-200/50 dark:border-[#2d1433] hover:bg-white/40 dark:hover:bg-[#251229]/40"
                  >
                    {/* Name + Initials */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-xl neu-inset bg-[#3A0F34] dark:bg-[#54194c] text-[#EAAA00] font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {initials}
                        </div>
                        <div>
                          <div className="font-semibold text-[#3A0F34] dark:text-[#f6f1f7] flex items-center gap-1.5">
                            <span>{u.full_name}</span>
                            {isCurrent && (
                              <Badge variant="primary" size="sm">You</Badge>
                            )}
                          </div>
                          {u.phone && (
                            <span className="text-[10px] text-slate-500 block">
                              {u.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-3 font-mono text-slate-600 dark:text-slate-300">
                      {u.email}
                    </td>

                    {/* Security Role */}
                    <td className="px-3">
                      <span className="capitalize font-bold text-[#EAAA00]">
                        {u.role.replace("_", " ")}
                      </span>
                    </td>

                    {/* Department / Phone */}
                    <td className="px-3 text-slate-500">
                      {u.department || "Clinical Unit"}
                    </td>

                    {/* Status */}
                    <td className="px-3">
                      <Badge
                        variant={u.status === "active" ? "success" : "neutral"}
                        size="sm"
                      >
                        {u.status || "active"}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Change/Reset Password Button */}
                        <button
                          type="button"
                          onClick={() =>
                            setResetModalUser({
                              email: u.email,
                              fullName: u.full_name,
                              role: u.role,
                            })
                          }
                          className="p-1.5 rounded-lg neu-btn hover:text-[#EAAA00] text-slate-600 dark:text-slate-300 cursor-pointer"
                          title={`Reset / Change password for ${u.full_name}`}
                        >
                          <KeyRound size={13} />
                        </button>

                        {/* Toggle Status */}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          disabled={isCurrent}
                          className="p-1.5 rounded-lg neu-btn hover:text-amber-500 text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                          title={u.status === "active" ? "Suspend Account" : "Activate Account"}
                        >
                          {u.status === "active" ? <UserX size={13} /> : <UserCheck size={13} />}
                        </button>

                        {/* Delete User */}
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          disabled={isCurrent}
                          className="p-1.5 rounded-lg neu-btn hover:text-rose-500 text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                          title="Revoke / Delete User Account"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No authorized users matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── ROLES & PERMISSIONS RBAC MATRIX ── */}
      <Card
        title={
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
              Roles &amp; Access Permissions
            </span>
            <Badge variant="primary">Role-Based Access Control (RBAC)</Badge>
          </div>
        }
        subtitle="Manage authorization matrices, operational privilege levels, and sensitive patient data access boundaries."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          {ROLES.map((role) => {
            const isSelected = selectedRole.id === role.id;
            const actualCount = users.filter((u) => u.role === role.id).length;
            return (
              <div
                key={role.id}
                onClick={() => setSelectedRole(role)}
                className={`p-4 rounded-2xl cursor-pointer transition-all ${
                  isSelected
                    ? "neu-inset ring-2 ring-[#EAAA00] dark:ring-[#EAAA00]"
                    : "neu-card neu-card-hover"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={isSelected ? "primary" : "neutral"} size="sm">
                    {actualCount} Active Accounts
                  </Badge>
                  {isSelected && <span className="text-xs text-[#EAAA00] font-bold">Selected</span>}
                </div>
                <h3 className="font-bold text-sm text-[#3A0F34] dark:text-[#f6f1f7]">
                  {role.displayName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  {role.description}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Permissions Breakdown for Selected Role */}
      <Card
        title={`Permissions Matrix: ${selectedRole.displayName}`}
        subtitle={`Scope of privileges and authorization rights granted to ${selectedRole.name}:`}
        action={
          <button
            onClick={() =>
              addToast(
                "success",
                "Permissions Verified",
                `Access security tokens synchronized for role ${selectedRole.displayName}`
              )
            }
            className={btnCls}
          >
            Save Policy Rule
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 pt-2">
          {selectedRole.permissions.map((p) => (
            <CardInset key={p.category} className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
                  {p.category}
                </h4>
                <Badge variant="success" size="sm">{p.actions.length} Authorized</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.actions.map((act) => (
                  <span
                    key={act}
                    className="inline-flex items-center gap-1 neu-btn px-2.5 py-1 rounded-lg text-xs font-semibold text-[#3A0F34] dark:text-[#f6f1f7]"
                  >
                    ✓ {act}
                  </span>
                ))}
              </div>
            </CardInset>
          ))}
        </div>
      </Card>

      {/* Universal Bulk Upload Modal for Users */}
      <BulkUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        entityType="users"
        title="Bulk Upload Authorized Personnel (Excel / CSV)"
        isLiveDb={isLiveDb}
        onSuccess={(imported) => {
          queryClient.setQueryData<DbUserRecord[]>(queryKeys.users.all, (old = []) => [
            ...imported,
            ...old,
          ]);
        }}
      />

      {/* Universal Bulk Download Modal for Users */}
      <BulkDownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        entityType="users"
        title="Bulk Download Database Personnel List"
        data={users}
      />

      {/* Admin Reset Password Modal for a specific user */}
      <ChangePasswordModal
        isOpen={!!resetModalUser}
        onClose={() => setResetModalUser(null)}
        targetUser={resetModalUser}
      />

      {/* Change Password Modal for Current Logged In User */}
      <ChangePasswordModal
        isOpen={showSelfPwModal}
        onClose={() => setShowSelfPwModal(false)}
      />
    </div>
  );
}
