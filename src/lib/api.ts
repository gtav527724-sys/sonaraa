export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
