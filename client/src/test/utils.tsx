import { ReactElement, ReactNode } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@contexts";

// Import gameStore to activate the auth subscription
import "@stores/gameStore";

// Create a new QueryClient for each test to avoid shared state
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface WrapperProps {
  children: ReactNode;
}

// All providers wrapper
const AllProviders = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>{children}</AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

// Minimal wrapper without game context (for isolated tests)
const MinimalProviders = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

// Custom render with all providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => render(ui, { wrapper: AllProviders, ...options });

// Render with minimal providers
const renderWithMinimalProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => render(ui, { wrapper: MinimalProviders, ...options });

// Re-export everything
export * from "@testing-library/react";
export { customRender as render, renderWithMinimalProviders };
export { createTestQueryClient };

// Helper to wait for async operations
export const waitForLoadingToFinish = () =>
  new Promise((resolve) => setTimeout(resolve, 0));

// Helper to create mock game state
export const createMockGameState = (overrides = {}) => ({
  id: "game-1",
  name: "Test Game",
  alias: "test-alias",
  maxPlayers: 4,
  isPrivate: false,
  status: "playing",
  players: [
    {
      id: "player-1",
      user: { id: "user-1", username: "player1" },
      isReady: true,
      score: 0,
      deck: {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [
          { id: "work-1", type: "work", cards: [] },
          { id: "work-2", type: "work", cards: [] },
          { id: "work-3", type: "work", cards: [] },
        ],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      },
    },
  ],
  bankPiles: [
    { id: "bank-1", type: "bank", cards: [] },
    { id: "bank-2", type: "bank", cards: [] },
    { id: "bank-3", type: "bank", cards: [] },
    { id: "bank-4", type: "bank", cards: [] },
  ],
  ...overrides,
});

// Helper to create mock card
export const createMockCard = (overrides = {}) => ({
  id: `card-${Math.random().toString(36).substr(2, 9)}`,
  number: 1,
  value: 1,
  color: { name: "red", code: "#dc2626", type: "a" as const },
  faceUp: true,
  ...overrides,
});
