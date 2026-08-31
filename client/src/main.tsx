// import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "@contexts";
import { queryClient } from "./lib/queryClient";
import "@shychedelic/voidglass-react/style.css";
import "@styles/index.css";
import "@styles/card.css";

// Side-effect import: this is what activates gameStore's auth subscription,
// which connects and disconnects the socket on login/logout. Nothing here
// references the module, so dropping it silently kills the socket lifecycle.
import "@stores/gameStore";

ReactDOM.createRoot(document.getElementById("root")!).render(
  // <React.StrictMode>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </QueryClientProvider>
  // </React.StrictMode>
);
