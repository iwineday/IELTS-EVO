/**
 * Shared DashScope (Alibaba Cloud Bailian) HTTP plumbing.
 * Read API key from env once; throw early if missing.
 */

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com"

export function getDashScopeKey(): string {
  const k = process.env.DASHSCOPE_API_KEY
  if (!k) throw new Error("DASHSCOPE_API_KEY missing — set it in .env.local")
  return k
}

export class DashScopeError extends Error {
  constructor(public status: number, public body: string, public requestId?: string) {
    super(`DashScope ${status}: ${body.slice(0, 200)}`)
  }
}

export async function dashScopeFetch(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const { json, headers, ...rest } = init
  const res = await fetch(`${DASHSCOPE_BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${getDashScopeKey()}`,
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new DashScopeError(res.status, body, res.headers.get("x-request-id") ?? undefined)
  }
  return res
}
