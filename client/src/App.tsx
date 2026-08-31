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

  // Returning something other than <Router> UNMOUNTS the whole tree, so this is
  // only allowed to be true while there is genuinely nothing to route: at boot,
  // before `fetchUserProfile` has said whether the persisted token is a session.
  // `authStore.loading` means that and only that - if a form's in-flight state
  // ever fed this, every submit would remount the form and blank its error.
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      {/* The skin sits at the root, not the board, so the toggle previews in
          the treatment it selects wherever it is shown. */}
      <AppContainer className={cardSkin === "emissive" ? "skin-emissive" : undefined}>
        {user && <Header />}
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" /> : <Login />}
          />
          <Route
            path="/register"
            element={user ? <Navigate to="/dashboard" /> : <Register />}
          />
          <Route
            path="/dashboard"
            element={user ? <Dashboard /> : <Navigate to="/login" />}
          />
          <Route
            path="/profile"
            element={user ? <Profile /> : <Navigate to="/login" />}
          />
          {/* No auth guard: the tutorial needs no account, no socket and no
              server, and someone deciding whether to sign up is exactly who
              should be able to play it. */}
          <Route path="/tutorial" element={<Tutorial />} />
          <Route
            path="/profile/history"
            element={user ? <History /> : <Navigate to="/login" />}
          />
          <Route
            path="/profile/history/:gameId"
            element={user ? <GameResults /> : <Navigate to="/login" />}
          />
          <Route
            path="/game/:gameId"
            element={user ? <Game /> : <Navigate to="/login" />}
          />
          <Route
            path="/"
            element={<Navigate to={user ? "/dashboard" : "/login"} />}
          />
        </Routes>
      </AppContainer>
    </Router>
  );
};

export default App;
