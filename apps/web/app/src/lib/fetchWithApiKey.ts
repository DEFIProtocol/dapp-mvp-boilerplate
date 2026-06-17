const DEV_API_KEY = process.env.NEXT_PUBLIC_DEVELOPER_API_KEY?.trim() || "";
const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export async function fetchWithApiKey(input: RequestInfo, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  if (DEV_API_KEY) {
    headers.set("x-api-key", DEV_API_KEY);
  }

  let request = input;
  if (typeof input === "string" && !input.startsWith("http")) {
    const normalizedPath = input.startsWith("/") ? input : `/${input}`;
    request = BACKEND_URL ? `${BACKEND_URL}${normalizedPath}` : normalizedPath;
  }

  return fetch(request, {
    ...init,
    headers,
  });
}
