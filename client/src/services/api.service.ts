export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly code?: string
  ) {
    super(`API Error: ${status}`);
    this.name = "ApiError";
  }
}

const parseErrorBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.clone().json();
  } catch {
    return undefined;
  }
};

const throwApiError = async (response: Response): Promise<never> => {
  const body = await parseErrorBody(response);
  const rawMessage =
    body && typeof body === "object" && "message" in body
      ? (body as { message?: unknown }).message
      : undefined;
  // A route that threads a typed reason puts it in `code`; the rest fall back to
  // Nest's default body, where `error` holds the HTTP status text. Preferring
  // `code` is what lets REST and the socket name the same failure the same way.
  const code =
    body && typeof body === "object" && "code" in body
      ? (body as { code?: unknown }).code
      : body && typeof body === "object" && "error" in body
        ? (body as { error?: unknown }).error
        : undefined;

  // Nest's ValidationPipe returns `message` as a string array; join for display.
  const message = Array.isArray(rawMessage)
    ? rawMessage.filter((m) => typeof m === "string").join(", ")
    : rawMessage;

  const error = new ApiError(
    response.status,
    body,
    typeof code === "string" ? code : undefined
  );
  if (typeof message === "string" && message.length > 0) {
    error.message = message;
  }
  throw error;
};

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Use the same hostname as the current page, but on port 3031
  return `http://${window.location.hostname}:3031`;
};

const API_BASE_URL = getApiBaseUrl();

export class ApiClient {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      await throwApiError(response);
    }

    return response.json();
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      ...(data && { body: JSON.stringify(data) }),
    });

    if (!response.ok) {
      await throwApiError(response);
    }

    return response.json();
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "PATCH",
      headers: this.getAuthHeaders(),
      ...(data ? { body: JSON.stringify(data) } : {}),
    });

    if (!response.ok) {
      await throwApiError(response);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();
