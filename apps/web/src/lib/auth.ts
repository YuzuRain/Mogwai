/**
 * better-auth REST 封装(/api/auth/* 由 core-app 托管,B4.1)。
 * 只用到 email+password 三个端点;session 状态以 GET profile 是否 401 判定
 * (管理面自身的鉴权语义,见 console/layout 的会话守卫)。
 */

async function authPost(path: string, body: Record<string, string>): Promise<void> {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const payload: unknown = await resp.json().catch(() => undefined);
    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `HTTP ${resp.status}`;
    throw new Error(message);
  }
}

export function signUp(email: string, password: string, name: string): Promise<void> {
  return authPost("/api/auth/sign-up/email", { email, password, name });
}

export function signIn(email: string, password: string): Promise<void> {
  return authPost("/api/auth/sign-in/email", { email, password });
}

export function signOut(): Promise<void> {
  return authPost("/api/auth/sign-out", {});
}
