import { vi } from "vitest";

// Mock socket.io-client
export const mockSocket = {
  connected: false,
  id: "mock-socket-id",
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
};

// Factory to create mock socket
export const createMockSocket = () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  return {
    connected: true,
    id: "mock-socket-id",
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    }),
    off: vi.fn((event: string, callback?: (...args: unknown[]) => void) => {
      if (callback && listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== callback);
      } else {
        delete listeners[event];
      }
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(() => {
      Object.keys(listeners).forEach((key) => delete listeners[key]);
    }),
    // Helper to simulate receiving events in tests
    simulateEvent: (event: string, ...args: unknown[]) => {
      if (listeners[event]) {
        listeners[event].forEach((callback) => callback(...args));
      }
    },
  };
};

// Mock io function
export const mockIo = vi.fn(() => mockSocket);

// Mock the socket service
export const mockSocketService = {
  socket: null as ReturnType<typeof createMockSocket> | null,
  connect: vi.fn((_token: string) => {
    mockSocketService.socket = createMockSocket();
    return mockSocketService.socket;
  }),
  disconnect: vi.fn(() => {
    mockSocketService.socket = null;
  }),
  emit: vi.fn((event: string, data?: unknown) => {
    mockSocketService.socket?.emit(event, data);
  }),
  on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
    mockSocketService.socket?.on(event, callback);
  }),
  off: vi.fn((event: string) => {
    mockSocketService.socket?.off(event);
  }),
  isConnected: () => mockSocketService.socket?.connected ?? false,
};
