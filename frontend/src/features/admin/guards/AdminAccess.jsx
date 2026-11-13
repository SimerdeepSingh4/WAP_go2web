import { Navigate } from "react-router";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function AdminAccess({ children }) {
  const { user } = useAuth();
  // Preview identities must never inherit operational access from their manager.
  if (user?.role !== "Super Admin" || user?.isPreview) return <Navigate to="/" replace />;
  return children;
}
