// Cliente das rotas de usuário final do Identity (identity/docs/api/contracts.md).
// Autenticação pela pk_ no header; o access token vai no corpo. Erros: RFC 9457 ({type, title, status, detail, invalid_params}).

import { Session, accessExpired, clearSession, getSession, saveSession } from "./session.ts";

export type Detail = { code: string; message: string };

export type Result<T> = {
  ok: boolean;
  // 0 quando a requisição nem chegou (rede, CORS bloqueado antes da resposta, API fora)
  status: number;
  data: T | null;
  // código do Identity ("rsb-00"), "network" sem resposta, "config" sem .env, "" no sucesso
  code: string;
  details: Detail[];
};

export type TokenPair = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  session_id: string;
};

// POST /v1/login e a confirmação do e-mail respondem o par de tokens achatado; com 2FA
// obrigatório vem só "mfa".
export type LoginData = TokenPair & {
  mfa?: { token: string; enrollment_required: boolean; expires_in: number } | null;
};

export type Me = {
  id: string;
  session_id: string;
  email: string | null;
  first_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  email_verified: boolean;
  roles: string[];
  mfa_enabled: boolean;
  created_at: string;
};

let baseUrl = "";
let publishableKey = "";

export function configureIdentity(url: string, pk: string): void {
  baseUrl = url.replace(/\/+$/, "");
  publishableKey = pk;
}

export function identityConfigured(): boolean {
  return baseUrl !== "" && /^pk_id_/.test(publishableKey);
}

// O que qualquer visitante vê de um usuário (GET /profiles/{id}).
export type PublicProfile = {
  id: string;
  first_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  created_at: string;
};

async function call<T>(path: string, body: unknown, method: string = "POST"): Promise<Result<T>> {
  if (!identityConfigured()) {
    return { ok: false, status: 0, data: null, code: "config", details: [] };
  }
  let res: Response;
  try {
    res = await fetch(baseUrl + path, {
      method: method,
      headers: { "Authorization": "Bearer " + publishableKey, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, data: null, code: "network", details: [] };
  }
  if (res.status === 204) {
    return { ok: true, status: 204, data: null, code: "", details: [] };
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch (e) {}
  if (res.ok) {
    return { ok: true, status: res.status, data: (json && json.data !== undefined ? json.data : json) as T, code: "", details: [] };
  }
  const details = problemDetails(json);
  return { ok: false, status: res.status, data: null, code: problemCode(json, res.status, details), details: details };
}

// Cada item de invalid_params vira um Detail: o code é o da regra quebrada
// (ex.: "rag-06") e a message é o motivo, em inglês, que a página só usa de
// fallback quando não tem texto próprio para o código.
function problemDetails(json: any): Detail[] {
  if (!json || !Array.isArray(json.invalid_params)) {
    return [];
  }
  return json.invalid_params.map((p: any) => ({ code: String(p.code || ""), message: String(p.reason || "") }));
}

// O código do erro é o fim do type (".../errors/#rsb-00"). Numa validação o type é
// só "#validation", então vale o código da primeira regra quebrada; sem nenhum dos
// dois, "http-<status>" (corpo que não é do Identity, como o de um proxy).
function problemCode(json: any, status: number, details: Detail[]): string {
  const type = json && typeof json.type === "string" ? json.type : "";
  const fragment = type.indexOf("#") >= 0 ? type.slice(type.lastIndexOf("#") + 1) : "";
  if (fragment !== "" && fragment !== "validation") {
    return fragment;
  }
  if (details.length > 0 && details[0].code !== "") {
    return details[0].code;
  }
  return "http-" + status;
}

export function signup(email: string, password: string, locale: string, firstName: string): Promise<Result<{ message: string }>> {
  return call("/signup", { email: email, password: password, locale: locale, first_name: firstName });
}

export function sendVerification(email: string, locale: string): Promise<Result<null>> {
  return call("/email/verification", { email: email, locale: locale });
}

export function confirmEmail(email: string, code: string, password: string): Promise<Result<LoginData>> {
  return call("/email/verification/confirm", { email: email, code: code, password: password });
}

export function login(email: string, password: string): Promise<Result<LoginData>> {
  return call("/login", { email: email, password: password });
}

export function me(accessToken: string): Promise<Result<Me>> {
  return call("/me", { access_token: accessToken });
}

export function publicProfile(userId: string): Promise<Result<PublicProfile>> {
  return call("/profiles/" + encodeURIComponent(userId), null, "GET");
}

// Campo ausente não muda; "" apaga. Com sucesso, o header passa a mostrar o nome e a foto novos.
export async function updateMe(fields: { first_name?: string; avatar_url?: string; cover_url?: string }): Promise<Result<Me>> {
  const s = await ensureSession();
  if (!s) {
    return { ok: false, status: 401, data: null, code: "rsb-05", details: [] };
  }
  const r = await call<Me>("/me", { access_token: s.access_token, ...fields }, "PATCH");
  if (r.ok && r.data) {
    saveSession({ ...s, first_name: r.data.first_name || "", avatar_url: r.data.avatar_url || "" });
  }
  return r;
}

export function refreshTokens(refreshToken: string): Promise<Result<TokenPair>> {
  return call("/token/refresh", { refresh_token: refreshToken });
}

export function logout(refreshToken: string): Promise<Result<null>> {
  return call("/logout", { refresh_token: refreshToken });
}

type Owner = { user_id: string; email: string; first_name?: string; avatar_url?: string };

function sessionFrom(pair: TokenPair, owner: Owner): Session {
  return {
    access_token: pair.access_token,
    refresh_token: pair.refresh_token,
    expires_at: Date.now() + pair.expires_in * 1000,
    user_id: owner.user_id,
    email: owner.email,
    first_name: owner.first_name || "",
    avatar_url: owner.avatar_url || "",
  };
}

// Guarda o par de tokens e completa com o /me (id, e-mail, nome e foto). Devolve a sessão, ou o erro do /me.
export async function startSession(pair: TokenPair): Promise<Result<Session>> {
  const who = await me(pair.access_token);
  if (!who.ok || !who.data) {
    return { ok: false, status: who.status, data: null, code: who.code, details: who.details };
  }
  const s = sessionFrom(pair, {
    user_id: who.data.id,
    email: who.data.email || "",
    first_name: who.data.first_name || "",
    avatar_url: who.data.avatar_url || "",
  });
  saveSession(s);
  return { ok: true, status: 200, data: s, code: "", details: [] };
}

let refreshing: Promise<Session | null> | null = null;

// Sessão válida para chamar as APIs: renova o access token quando ele venceu (uma renovação
// por vez). Sem sessão, ou com o refresh recusado, limpa e devolve null.
export function ensureSession(force: boolean = false): Promise<Session | null> {
  const s = getSession();
  if (!s) {
    return Promise.resolve(null);
  }
  if (!force && !accessExpired(s)) {
    return Promise.resolve(s);
  }
  if (!refreshing) {
    refreshing = (async () => {
      const r = await refreshTokens(s.refresh_token);
      refreshing = null;
      if (r.ok && r.data) {
        const next = sessionFrom(r.data, s);
        saveSession(next);
        return next;
      }
      if (r.status === 0) {
        // sem resposta: mantém a sessão e deixa a chamada seguinte decidir
        return s;
      }
      clearSession();
      return null;
    })();
  }
  return refreshing;
}

// Encerra a sessão no servidor (melhor esforço) e no navegador.
export async function signOut(): Promise<void> {
  const s = getSession();
  clearSession();
  if (s) {
    try {
      await logout(s.refresh_token);
    } catch (e) {}
  }
}

// Locale aceito pelo Identity ("pt-BR", "en-US") a partir do lang do <html> ("pt-br").
export function localeOf(lang: string): string {
  const parts = (lang || "en").split("-");
  if (parts.length < 2) {
    return parts[0].toLowerCase();
  }
  return parts[0].toLowerCase() + "-" + parts[1].toUpperCase();
}
