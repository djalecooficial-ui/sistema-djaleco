import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  pageKey?: string;
}

export function ProtectedRoute({ children, adminOnly = false, pageKey }: ProtectedRouteProps) {
  const { user, role, loading, canAccess } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && role !== "admin") {
    return <Navigate to="/" replace />;
  }

  if (pageKey && !canAccess(pageKey)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
