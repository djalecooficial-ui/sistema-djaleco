import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type AppRole = "admin" | "user";

// Páginas que não têm registro em user_page_access ficam liberadas por
// padrão — mesmo comportamento de antes dessa tabela existir.
const DEFAULT_ALLOWED = true;

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  canAccess: (pageKey: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
  isAdmin: false,
  canAccess: () => true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export { AuthContext };

export function useAuthProvider(): AuthContextType {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageAccess, setPageAccess] = useState<Record<string, boolean>>({});

  const fetchRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.warn("[useAuth] fetchRole error:", error.message);
      }
      setRole((data?.role as AppRole) ?? "user");
    } catch (e) {
      console.warn("[useAuth] fetchRole exception:", e);
      setRole("user");
    }
  }, []);

  const fetchPageAccess = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_page_access")
        .select("page_key, allowed")
        .eq("user_id", userId);
      if (error) {
        console.warn("[useAuth] fetchPageAccess error:", error.message);
        return;
      }
      const map: Record<string, boolean> = {};
      for (const row of data ?? []) map[row.page_key] = row.allowed;
      setPageAccess(map);
    } catch (e) {
      console.warn("[useAuth] fetchPageAccess exception:", e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Safety net: never let the spinner spin forever
    const safetyTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    // Listen FIRST so we don't miss events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          // Defer async work outside the callback to avoid deadlocks
          setTimeout(() => {
            if (mounted) {
              fetchRole(currentUser.id);
              fetchPageAccess(currentUser.id);
            }
          }, 0);
        } else {
          setRole(null);
          setPageAccess({});
        }
        setLoading(false);
      }
    );

    // Then get initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          // Fire and forget — don't block loading on this
          fetchPageAccess(currentUser.id);
          fetchRole(currentUser.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("[useAuth] getSession failed:", e);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signOut = useCallback(async () => {
    setUser(null);
    setRole(null);
    setPageAccess({});
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const isAdmin = role === "admin";
  const canAccess = useCallback(
    (pageKey: string) => {
      if (isAdmin) return true;
      return pageAccess[pageKey] ?? DEFAULT_ALLOWED;
    },
    [isAdmin, pageAccess],
  );

  return {
    user,
    role,
    loading,
    signOut,
    isAdmin,
    canAccess,
  };
}
