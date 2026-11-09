"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { recordLoginAttempt, recordAuditLog, bulkCreateUsersInDb } from "@/lib/dataService";
import type { Session, User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status?: string;
  department?: string;
  phone?: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  role: string;
  department?: string;
  phone?: string;
  status?: "active" | "suspended";
}

export interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  changePassword: (
    newPassword: string,
    oldPassword?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  registerUserAccount: (
    payload: RegisterPayload,
  ) => Promise<{ success: boolean; error?: string }>;
  resetUserPassword: (
    email: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateUserStatus: (
    email: string,
    status: "active" | "suspended",
  ) => Promise<{ success: boolean; error?: string }>;
  deleteUserAccount: (
    email: string,
  ) => Promise<{ success: boolean; error?: string }>;
  isAuthenticated: boolean;
}

const ACTIVE_SESSION_STORAGE_KEY = "befal_auth_session";
const REGISTERED_USERS_STORAGE_KEY = "befal_registered_users";

// Default authorized administrative accounts (in-memory / fallback)
const INITIAL_UMEED_ADMIN = {
  id: "usr-umeed-001",
  email: "umeedwelfarefoundation7@gmail.com",
  password: "123456",
  fullName: "Umeed Welfare Foundation (Lead Administrator)",
  role: "super_admin",
  status: "active",
  department: "Executive Clinical Committee",
  phone: "+92 300 1234567",
};

const INITIAL_SUPER_ADMIN = {
  id: "usr-admin-001",
  email: "admin@umeed.org",
  password: "Password123!",
  fullName: "Rauf Ahmed (Lead Administrator)",
  role: "super_admin",
  status: "active",
  department: "Executive Clinical Committee",
  phone: "+92 300 1234567",
};

const INITIAL_CLINICIAN = {
  id: "usr-clinician-002",
  email: "clinician@umeed.org",
  password: "Password123!",
  fullName: "Staff Clinician",
  role: "clinician",
  status: "active",
  department: "Day Care Infusion Center",
  phone: "+92 301 7654321",
};

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({}),
  signOut: async () => {},
  changePassword: async () => ({ success: false }),
  registerUserAccount: async () => ({ success: false }),
  resetUserPassword: async () => ({ success: false }),
  updateUserStatus: async () => ({ success: false }),
  deleteUserAccount: async () => ({ success: false }),
  isAuthenticated: false,
});

export const useAuth = () => useContext(AuthContext);

// ─── Helper: map Supabase User → AuthUser ─────────────────────────────────────
function mapSupabaseUser(
  user: User,
  dbRole?: string,
  dbName?: string,
  dbDepartment?: string,
  dbPhone?: string,
): AuthUser {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? "",
    name:
      dbName || meta.full_name || meta.name || user.email || "Clinical Officer",
    role: dbRole || meta.role || "clinician",
    status: "active",
    department: dbDepartment || meta.department || "HTC Center",
    phone: dbPhone || meta.phone || "",
  };
}

// ─── Helper: Get local user registry ──────────────────────────────────────────
export function getStoredAuthorizedUsers(): any[] {
  const defaults = [
    INITIAL_UMEED_ADMIN,
    INITIAL_SUPER_ADMIN,
    INITIAL_CLINICIAN,
  ];
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(
        REGISTERED_USERS_STORAGE_KEY,
        JSON.stringify(defaults),
      );
      return defaults;
    }
    const parsed: any[] = JSON.parse(raw);
    for (const def of defaults) {
      const idx = parsed.findIndex(
        (u) => u.email?.toLowerCase() === def.email.toLowerCase(),
      );
      if (idx === -1) {
        parsed.unshift(def);
      } else {
        parsed[idx] = { ...parsed[idx], ...def };
      }
    }
    localStorage.setItem(
      REGISTERED_USERS_STORAGE_KEY,
      JSON.stringify(parsed),
    );
    return parsed;
  } catch {
    return defaults;
  }
}

export function saveStoredAuthorizedUsers(users: any[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(REGISTERED_USERS_STORAGE_KEY, JSON.stringify(users));
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore authenticated session on mount
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      // 1. Check local session storage first
      try {
        const localRaw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        if (localRaw) {
          const storedUser: AuthUser = JSON.parse(localRaw);
          if (!cancelled && storedUser && storedUser.email) {
            setUser(storedUser);
            setLoading(false);
            return;
          }
        }
      } catch {
        // continue
      }

      // 2. Check Supabase auth session
      if (isSupabaseConfigured) {
        try {
          const { data } = await supabase.auth.getSession();
          if (!cancelled && data.session) {
            setSession(data.session);
            setUser(mapSupabaseUser(data.session.user));
          }
        } catch {
          // Supabase session unavailable
        }
      }

      if (!cancelled) setLoading(false);
    }

    restoreSession();

    // Listen to Supabase auth events
    let subscription: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
        if (cancelled) return;
        if (sess) {
          setSession(sess);
          const mapped = mapSupabaseUser(sess.user);
          setUser(mapped);
          localStorage.setItem(
            ACTIVE_SESSION_STORAGE_KEY,
            JSON.stringify(mapped),
          );
        }
        setLoading(false);
      });
      subscription = data.subscription;
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  // ── Strict Sign In (Supabase Auth First -> DB Profile -> Local Fallback) ──
  const signIn = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Try Supabase Authentication First
    if (isSupabaseConfigured) {
      try {
        const { data: authData, error: authError } =
          await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

        // Supabase Auth succeeded: User is now authenticated with a valid token
        if (!authError && authData?.session) {
          // Now that user is authenticated, RLS allows querying public.users
          const { data: dbUser } = await supabase
            .from("users")
            .select("id, email, full_name, role, status, department, phone")
            .eq("email", normalizedEmail)
            .maybeSingle();

        
          // Check if DB explicitly marked user as inactive / suspended
          if (dbUser && dbUser.status && dbUser.status !== "active") {
            await supabase.auth.signOut();
            await recordLoginAttempt(normalizedEmail, false);
            await recordAuditLog({
              user_id: dbUser.id,
              user_email: normalizedEmail,
              action: "LOGIN_SUSPENDED",
              resource: "/auth/login",
              status: "blocked",
              details: `User status is '${dbUser.status}'. Denied entry.`,
            });
            return {
              error: `Access Denied: Account status is '${dbUser.status}'. Contact system administrator.`,
            };
          }

          setSession(authData.session);
          const mapped = mapSupabaseUser(
            authData.session.user,
            dbUser?.role,
            dbUser?.full_name,
            dbUser?.department,
            dbUser?.phone,
          );
          setUser(mapped);
          localStorage.setItem(
            ACTIVE_SESSION_STORAGE_KEY,
            JSON.stringify(mapped),
          );

          // Log success & update last_login
          await recordLoginAttempt(normalizedEmail, true);
          await recordAuditLog({
            user_id: dbUser?.id || authData.session.user.id,
            user_email: normalizedEmail,
            action: "LOGIN_SUCCESS",
            resource: "/auth/login",
            status: "success",
            details: "Successful authenticated login to UMEED Registry.",
          });

          // Update last_login in users table if available
          supabase
            .from("users")
            .update({ last_login: new Date().toISOString() })
            .eq("email", normalizedEmail)
            .then();

          return {};
        }

        // If Supabase Auth failed with an explicit error (other than invalid login), log notice
        if (authError && authError.message !== "Invalid login credentials") {
          console.warn("Supabase Auth sign-in warning:", authError.message);
        }
      } catch (err: any) {
        console.warn("Database login verification error:", err);
      }
    }

    // 2. Pre-authorized Local Fallback Verification (Controlled database credentials)
    const registeredList = getStoredAuthorizedUsers();
    const matched = registeredList.find(
      (u) =>
        u.email.toLowerCase() === normalizedEmail && u.password === password,
    );

    if (matched) {
      if (matched.status && matched.status !== "active") {
        return {
          error: `Access Denied: Account status is '${matched.status}'. Contact system administrator.`,
        };
      }

      const authUser: AuthUser = {
        id: matched.id || `usr-${Date.now()}`,
        email: matched.email,
        name: matched.fullName || matched.name,
        role: matched.role || "clinician",
        status: matched.status || "active",
        department: matched.department || "HTC Center",
        phone: matched.phone || "",
      };
      setUser(authUser);
      localStorage.setItem(
        ACTIVE_SESSION_STORAGE_KEY,
        JSON.stringify(authUser),
      );

      await recordLoginAttempt(normalizedEmail, true);
      await recordAuditLog({
        user_id: authUser.id,
        user_email: normalizedEmail,
        action: "LOGIN_SUCCESS",
        resource: "/auth/login",
        status: "success",
        details: "Authenticated via pre-authorized credentials.",
      });

      return {};
    }

    await recordLoginAttempt(normalizedEmail, false);
    await recordAuditLog({
      user_email: normalizedEmail,
      action: "LOGIN_FAILED",
      resource: "/auth/login",
      status: "failure",
      details: "Invalid email or password attempt.",
    });

    return {
      error:
        "Access Denied: Invalid email or password. Only pre-authorized database personnel are granted access.",
    };
  }, []);


  // ── Change Own Password ─────────────────────────────────────────────────────
  const changePassword = useCallback(
    async (newPassword: string, oldPassword?: string) => {
      if (!user) return { success: false, error: "No active authenticated session." };
      if (!newPassword || newPassword.length < 6) {
        return { success: false, error: "New password must be at least 6 characters." };
      }

      const email = user.email.toLowerCase();
      const stored = getStoredAuthorizedUsers();
      const existingIndex = stored.findIndex((u) => u.email.toLowerCase() === email);

      if (existingIndex >= 0) {
        if (oldPassword && stored[existingIndex].password !== oldPassword) {
          return { success: false, error: "Current password does not match existing records." };
        }
        stored[existingIndex].password = newPassword;
        saveStoredAuthorizedUsers(stored);
      }

      // If Supabase is connected, update Supabase auth password
      if (isSupabaseConfigured && session) {
        try {
          const { error } = await supabase.auth.updateUser({ password: newPassword });
          if (error) {
            console.warn("Supabase auth password update notice:", error.message);
          }
        } catch (err: any) {
          console.warn("Supabase password update exception:", err);
        }
      }

      await recordAuditLog({
        user_id: user.id,
        user_email: user.email,
        action: "PASSWORD_CHANGED",
        resource: "/auth/password",
        status: "success",
        details: `Personnel ${user.name} successfully updated authentication credentials.`,
      });

      return { success: true };
    },
    [user, session],
  );

  // ── Register / Provision New Authorized Account (with Password/Words Setup) ─
  const registerUserAccount = useCallback(
    async (payload: RegisterPayload) => {
      const normalized = payload.email.trim().toLowerCase();
      if (!normalized || !payload.fullName.trim()) {
        return { success: false, error: "Authorized personnel name and email are required." };
      }
      if (!payload.password || payload.password.length < 6) {
        return { success: false, error: "Account password/phrase must be at least 6 characters." };
      }

      const stored = getStoredAuthorizedUsers();
      const existing = stored.find((u) => u.email.toLowerCase() === normalized);

      const newUserObj = {
        id: existing?.id || `usr-${Date.now()}`,
        email: normalized,
        password: payload.password,
        fullName: payload.fullName.trim(),
        role: payload.role || "clinician",
        status: payload.status || "active",
        department: payload.department || "Clinical Unit",
        phone: payload.phone || "",
      };

      if (existing) {
        const idx = stored.indexOf(existing);
        stored[idx] = newUserObj;
      } else {
        stored.unshift(newUserObj);
      }
      saveStoredAuthorizedUsers(stored);

      // Persist into database table
      try {
        await bulkCreateUsersInDb(
          [
            {
              id: newUserObj.id,
              email: newUserObj.email,
              full_name: newUserObj.fullName,
              role: newUserObj.role as any,
              status: newUserObj.status as any,
              department: newUserObj.department,
              phone: newUserObj.phone,
            },
          ],
          true,
        );
      } catch {
        // continue
      }

      // If Supabase Auth is enabled, register auth user
      if (isSupabaseConfigured) {
        try {
          await supabase.auth.signUp({
            email: normalized,
            password: payload.password,
            options: {
              data: {
                full_name: newUserObj.fullName,
                role: newUserObj.role,
                department: newUserObj.department,
                phone: newUserObj.phone,
              },
            },
          });
        } catch {
          // continue
        }
      }

      await recordAuditLog({
        user_id: user?.id,
        user_email: user?.email,
        action: "USER_PROVISIONED",
        resource: `/users/${normalized}`,
        status: "success",
        details: `Provisioned authorized access account for ${newUserObj.fullName} (${newUserObj.role}) with security credentials.`,
      });

      return { success: true };
    },
    [user],
  );

  // ── Reset Any User Password (Administrator Override) ────────────────────────
  const resetUserPassword = useCallback(
    async (email: string, newPassword: string) => {
      const normalized = email.trim().toLowerCase();
      if (!newPassword || newPassword.length < 6) {
        return { success: false, error: "New password must be at least 6 characters." };
      }

      const stored = getStoredAuthorizedUsers();
      const existingIndex = stored.findIndex((u) => u.email.toLowerCase() === normalized);

      if (existingIndex >= 0) {
        stored[existingIndex].password = newPassword;
        saveStoredAuthorizedUsers(stored);
      } else {
        stored.push({
          id: `usr-${Date.now()}`,
          email: normalized,
          password: newPassword,
          fullName: normalized.split("@")[0],
          role: "clinician",
          status: "active",
        });
        saveStoredAuthorizedUsers(stored);
      }

      await recordAuditLog({
        user_id: user?.id,
        user_email: user?.email,
        action: "ADMIN_RESET_PASSWORD",
        resource: `/users/${normalized}/password`,
        status: "success",
        details: `Administrator ${user?.name || "Admin"} updated credentials for account ${normalized}.`,
      });

      return { success: true };
    },
    [user],
  );

  // ── Update Account Status (Active / Suspended) ───────────────────────────────
  const updateUserStatus = useCallback(
    async (email: string, status: "active" | "suspended") => {
      const normalized = email.trim().toLowerCase();
      const stored = getStoredAuthorizedUsers();
      const target = stored.find((u) => u.email.toLowerCase() === normalized);
      if (target) {
        target.status = status;
        saveStoredAuthorizedUsers(stored);
      }

      if (isSupabaseConfigured) {
        try {
          await supabase.from("users").update({ status }).eq("email", normalized);
        } catch {
          // continue
        }
      }

      await recordAuditLog({
        user_id: user?.id,
        user_email: user?.email,
        action: "USER_STATUS_CHANGE",
        resource: `/users/${normalized}/status`,
        status: "success",
        details: `Updated account status for ${normalized} to '${status}'.`,
      });

      return { success: true };
    },
    [user],
  );

  // ── Delete / Deauthorize User Account ───────────────────────────────────────
  const deleteUserAccount = useCallback(
    async (email: string) => {
      const normalized = email.trim().toLowerCase();
      const stored = getStoredAuthorizedUsers();
      const filtered = stored.filter((u) => u.email.toLowerCase() !== normalized);
      saveStoredAuthorizedUsers(filtered);

      if (isSupabaseConfigured) {
        try {
          await supabase.from("users").delete().eq("email", normalized);
        } catch {
          // continue
        }
      }

      await recordAuditLog({
        user_id: user?.id,
        user_email: user?.email,
        action: "USER_DEAUTHORIZE",
        resource: `/users/${normalized}`,
        status: "success",
        details: `Revoked database access and removed account for ${normalized}.`,
      });

      return { success: true };
    },
    [user],
  );

  // ── Sign Out ────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signOut,
        changePassword,
        registerUserAccount,
        resetUserPassword,
        updateUserStatus,
        deleteUserAccount,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
