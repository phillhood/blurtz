import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useAuthContext } from "@hooks";
import {
  Login,
  Register,
  Dashboard,
  Game,
  Profile,
  History,
  GameResults,
  Tutorial,
} from "@views";
import { Header } from "@components/layout";
import { useAuthStore } from "@stores/authStore";
import { AppContainer } from "@styles";

const App: React.FC = () => {
  const { user, loading } = useAuthContext();
  const cardSkin = useAuthStore((state) => state.user?.cardSkin ?? "solid");

  // Gated per route, not around the Router. `authStore.loading` means one thing
  // - boot, before `fetchUserProfile` has said whether a persisted token is a
  // session - and every route that depends on knowing waits for it. `/tutorial`
  // does not depend on knowing: it needs no account and no server, so gating it
  // behind a request that can hang would make it unavailable in exactly the
  // degraded-server case it exists to survive. Returning something other than
  // <Router> would also UNMOUNT the whole tree and throw away tutorial progress
  // the moment the profile request resolved.
  const booting = <div>Loading...</div>;
  const guarded = (element: React.ReactElement) =>
    loading ? booting : user ? element : <Navigate to="/login" />;
  const anonymous = (element: React.ReactElement) =>
    loading ? booting : user ? <Navigate to="/dashboard" /> : element;

  return (
    <Router>
      {/* The skin sits at the root, not the board, so the toggle previews in
          the treatment it selects wherever it is shown. */}
      <AppContainer className={cardSkin === "emissive" ? "skin-emissive" : undefined}>
        {user && <Header />}
        <Routes>
          <Route path="/login" element={anonymous(<Login />)} />
          <Route path="/register" element={anonymous(<Register />)} />
          <Route path="/dashboard" element={guarded(<Dashboard />)} />
          <Route path="/profile" element={guarded(<Profile />)} />
          {/* No auth guard: the tutorial needs no account, no socket and no
              server, and someone deciding whether to sign up is exactly who
              should be able to play it. */}
          <Route path="/tutorial" element={<Tutorial />} />
          <Route path="/profile/history" element={guarded(<History />)} />
          <Route
            path="/profile/history/:gameId"
            element={guarded(<GameResults />)}
          />
          <Route path="/game/:gameId" element={guarded(<Game />)} />
          <Route
            path="/"
            element={
              loading ? booting : <Navigate to={user ? "/dashboard" : "/login"} />
            }
          />
        </Routes>
      </AppContainer>
    </Router>
  );
};

export default App;
