import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { handleAuthExpired } from "@/lib/sessionGuard";
import { setStaffAssistantUser } from "@/hooks/useStaffAssistantStore";
import { isProfileComplete } from "@/lib/profileCompleteness";

type AppRole = "super_admin" | "admin" | "teacher" | "student";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  collegeId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isSuperAdmin: boolean;
  /** 仅学生有意义：null=尚未加载 */
  profileComplete: boolean | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [collegeId, setCollegeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, class_name, major, id_card, gender")
      .eq("user_id", userId)
      .maybeSingle();
    setProfileComplete(isProfileComplete(data));
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role, college_id")
      .eq("user_id", userId);
    const rs = (data?.map((r) => r.role as AppRole)) ?? [];
    setRoles(rs);
    // Pick college_id from first non-super_admin row that has one
    const cid = (data ?? []).find((r) => r.role !== "super_admin" && r.college_id)?.college_id ?? null;
    setCollegeId(cid as string | null);
    if (rs.includes("student")) await fetchProfile(userId);
    else setProfileComplete(true);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setStaffAssistantUser(newSession?.user?.id ?? null);
      if (newSession?.user) {
        // Defer Supabase calls to avoid deadlock
        setTimeout(() => fetchRoles(newSession.user.id), 0);
      } else {
        setRoles([]);
        setCollegeId(null);
        setProfileComplete(null);
        // Token refresh failed (newSession === null on TOKEN_REFRESHED) or
        // server-side sign-out arrived → kick to /login (unless already there).
        if (
          (event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") &&
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login")
        ) {
          setTimeout(() => { void handleAuthExpired(); }, 0);
        }
      }
    });

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      setStaffAssistantUser(existing?.user?.id ?? null);
      if (existing?.user) {
        fetchRoles(existing.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = roles.includes("super_admin");

  return (
    <AuthContext.Provider value={{ user, session, roles, collegeId, loading, signIn, signOut, hasRole, isSuperAdmin, profileComplete, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
