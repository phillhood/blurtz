export const createSocketConfig = (token: string) => ({
  auth: { token },
  transports: ["websocket", "polling"] as const,
  reconnection: true,
  reconnectionAttempts: 3,
  reconnectionDelay: 1000,
  timeout: 5000,
});