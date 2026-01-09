// import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "@contexts";
import { queryClient } from "./lib/queryClient";
import "@styles/index.css";
import "@styles/fonts.css";

// Import gameStore to activate the auth subscription
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
