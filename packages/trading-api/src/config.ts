let apiBaseUrl = "/api";

export function setApiBaseUrl(url: string): void {
  if (typeof url !== "string") return;
  const trimmed = url.trim();
  if (!trimmed) return;
  apiBaseUrl = trimmed.replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}
