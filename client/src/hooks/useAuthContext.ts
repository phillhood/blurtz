import { useAuthStore } from "@stores";

// Hook for backwards compatibility - delegates to Zustand store
export const useAuthContext = () => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const logout = useAuthStore((state) => state.logout);

  return { user, loading, login, register, logout };
};
