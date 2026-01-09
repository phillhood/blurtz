import React, { ReactNode, useEffect } from "react";
import { useAuthStore } from "@stores";

interface AuthProviderProps {
  children: ReactNode;
}

// Provider component that initializes the store on mount
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const fetchUserProfile = useAuthStore((state) => state.fetchUserProfile);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  return <>{children}</>;
};
