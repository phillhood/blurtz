import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { User } from "@types";
import { authService } from "@services/auth.service";
import { ApiError } from "@services/api.service";

interface AuthState {
  user: User | null;
  /**
   * The persisted session is still being resolved. Nothing else.
   *
   * It starts `true` and goes `false` exactly once, when `fetchUserProfile`
   * settles: until then a token in localStorage may or may not turn out to be
   * a signed-in user, and `App` cannot decide between the router's
   * authenticated and anonymous branches without knowing which.
   *
   * `login` and `register` deliberately do NOT set it. They used to, and `App`
   * unmounts the whole router while it is true - so a failed login threw away
   * the `<Login>` that was about to show the error, along with the credentials
   * the user had typed. Both forms already track their own in-flight state
   * locally, which is what a disabled submit button should read anyway.
   */
  loading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchUserProfile: () => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        // State
        user: null,
        loading: true,
        error: null,

        // Actions
        login: async (username: string, password: string) => {
          set({ error: null });
          try {
            const response = await authService.login({ username, password });
            localStorage.setItem("token", response.token);
            set({ user: response.user, error: null });
          } catch (error: any) {
            set({ error: error.message || "Login failed" });
            throw new Error(error.message || "Login failed");
          }
        },

        register: async (username: string, password: string) => {
          set({ error: null });
          try {
            const response = await authService.register({ username, password });
            localStorage.setItem("token", response.token);
            set({ user: response.user, error: null });
          } catch (error: any) {
            set({ error: error.message || "Registration failed" });
            throw new Error(error.message || "Registration failed");
          }
        },

        logout: () => {
          localStorage.removeItem("token");
          set({ user: null, loading: false, error: null });
        },

        fetchUserProfile: async () => {
          const token = localStorage.getItem("token");
          if (!token) {
            set({ loading: false });
            return;
          }

          set({ loading: true });
          try {
            const userData = await authService.getProfile();
            set({ user: userData, loading: false, error: null });
          } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
              localStorage.removeItem("token");
              set({ user: null, loading: false, error: null });
            } else {
              set({ loading: false });
            }
          }
        },

        clearError: () => set({ error: null }),
        setLoading: (loading: boolean) => set({ loading }),
      }),
      {
        name: "auth-storage",
        partialize: (state) => ({ user: state.user }),
      }
    ),
    { name: "AuthStore" }
  )
);

// Hook for backwards compatibility with context API
export const useAuth = () => {
  const store = useAuthStore();
  return {
    user: store.user,
    loading: store.loading,
    login: store.login,
    register: store.register,
    logout: store.logout,
  };
};
