import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useAuthContext } from "@hooks";
import { Login, Register, Dashboard, Game } from "@views";
import { Header } from "@components/layout";
import { AppContainer } from "@styles";

const App: React.FC = () => {
  const { user, loading } = useAuthContext();

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
      <AppContainer>
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
