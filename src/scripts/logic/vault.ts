// Cliente da API do Vault (vault/docs/api.md). Pessoa autenticada pelo JWT do Identity
// (Authorization: Bearer <access token>). Erros em RFC 9457: {"error": {type, title, status,
// detail, invalid_params}}; o fragmento do "type" (#validation, #conflict...) é o que o front lê.

import { clearSession } from "./session.ts";
import { ensureSession } from "./identity.ts";

export type InvalidParam = { name: string; reason: string };

export type Res<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  // "validation" | "unauthorized" | "forbidden" | "not-found" | "conflict" | "internal" |
  // "unavailable" | "network" | "config" | "session" | "" no sucesso
  error: string;
  detail: string;
  params: InvalidParam[];
};

export type Page = { page: number; limit: number; total: number; has_next: boolean; has_prev: boolean };

export type Application = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
};

export type Member = {
  id: string;
  application_id: string;
  user_id: string;
  uri_id: string;
  role: string;
  status: string;
  created_at: string;
};

export type Invitation = {
  id: string;
  application_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_by: string;
  created_at: string;
  // só na criação
  token?: string;
};

export type Secret = {
  id: string;
  application_id: string;
  member_id: string;
  name: string;
  type: string;
  source: string;
  reference_secret_id: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string | null;
};

export type SecretValue = { id: string; name: string; version: number; value: string };

export type SecretVersion = { version: number; created_by: string; created_at: string };

export type Token = {
  id: string;
  name: string;
  type: "publishable" | "secret";
  prefix: string;
  uri_id: string;
  expires_at: string | null;
  last_used_at: string | null;
  deleted_at: string | null;
  created_at: string;
  // só na criação
  key?: string;
  uri?: string;
};

export const SECRET_TYPES = ["string", "password", "url", "database_uri", "api_key", "jwt_key", "paseto_key"];

let baseUrl = "";

export function configureVault(url: string): void {
  baseUrl = url.replace(/\/+$/, "");
}

function fail<T>(status: number, error: string, detail: string = ""): Res<T> {
  return { ok: false, status: status, data: null, error: error, detail: detail, params: [] };
}

async function req<T>(method: string, path: string, body?: unknown, retry: boolean = true): Promise<Res<T>> {
  if (baseUrl === "") {
    return fail(0, "config");
  }
  const s = await ensureSession();
  if (!s) {
    return fail(401, "session");
  }
  const headers: Record<string, string> = { "Authorization": "Bearer " + s.access_token, "Accept": "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(baseUrl + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    return fail(0, "network");
  }
  if (res.status === 401 && retry) {
    // access token recusado: renova uma vez e repete; recusado de novo, a sessão acabou
    const renewed = await ensureSession(true);
    if (renewed) {
      return req<T>(method, path, body, false);
    }
    return fail(401, "session");
  }
  if (res.status === 401) {
    clearSession();
    return fail(401, "session");
  }
  if (res.status === 204) {
    return { ok: true, status: 204, data: null, error: "", detail: "", params: [] };
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch (e) {}
  if (res.ok) {
    return { ok: true, status: res.status, data: (json ? json.data : null) as T, error: "", detail: "", params: [] };
  }
  const err = json && json.error ? json.error : {};
  const type = typeof err.type === "string" ? err.type : "";
  const frag = type.indexOf("#") >= 0 ? type.slice(type.indexOf("#") + 1) : "http-" + res.status;
  return {
    ok: false,
    status: res.status,
    data: null,
    error: frag,
    detail: typeof err.detail === "string" ? err.detail : "",
    params: Array.isArray(err.invalid_params) ? err.invalid_params : [],
  };
}

const LIST = "?page=1&limit=150";

// ---------- aplicações ----------

export function listApplications(): Promise<Res<Application[]>> {
  return req("GET", "/applications" + LIST);
}

export function createApplication(name: string): Promise<Res<Application>> {
  return req("POST", "/applications", { name: name });
}

export function getApplication(app: string): Promise<Res<Application>> {
  return req("GET", "/applications/" + app);
}

export function renameApplication(app: string, name: string): Promise<Res<Application>> {
  return req("PATCH", "/applications/" + app, { name: name });
}

export function deleteApplication(app: string): Promise<Res<null>> {
  return req("DELETE", "/applications/" + app);
}

// ---------- membros ----------

export function listMembers(app: string): Promise<Res<Member[]>> {
  return req("GET", "/applications/" + app + "/members" + LIST);
}

export function myMembership(app: string): Promise<Res<Member>> {
  return req("GET", "/applications/" + app + "/members/me");
}

export function updateMember(app: string, member: string, patch: { role?: string; status?: string }): Promise<Res<Member>> {
  return req("PATCH", "/applications/" + app + "/members/" + member, patch);
}

export function removeMember(app: string, member: string): Promise<Res<null>> {
  return req("DELETE", "/applications/" + app + "/members/" + member);
}

// ---------- convites ----------

export function listInvitations(app: string): Promise<Res<Invitation[]>> {
  return req("GET", "/applications/" + app + "/invitations" + LIST);
}

export function createInvitation(app: string, email: string, role: string): Promise<Res<Invitation>> {
  return req("POST", "/applications/" + app + "/invitations", { email: email, role: role });
}

export function revokeInvitation(app: string, id: string): Promise<Res<null>> {
  return req("DELETE", "/applications/" + app + "/invitations/" + id);
}

export function acceptInvitation(token: string): Promise<Res<Member>> {
  return req("POST", "/invitations/accept", { token: token });
}

// ---------- segredos (a tabela é de um membro; "me" é o próprio) ----------

function secretsPath(app: string, member: string): string {
  return "/applications/" + app + "/members/" + member + "/secrets";
}

export function listSecrets(app: string, member: string = "me"): Promise<Res<Secret[]>> {
  return req("GET", secretsPath(app, member) + LIST);
}

export function createSecret(app: string, member: string, body: { name: string; type: string; value?: string; source?: string; reference_secret_id?: string }): Promise<Res<Secret>> {
  return req("POST", secretsPath(app, member), body);
}

export function updateSecretValue(app: string, member: string, id: string, value: string): Promise<Res<Secret>> {
  return req("PUT", secretsPath(app, member) + "/" + id, { value: value });
}

export function renameSecret(app: string, member: string, id: string, name: string): Promise<Res<Secret>> {
  return req("PATCH", secretsPath(app, member) + "/" + id, { name: name });
}

export function deleteSecret(app: string, member: string, id: string): Promise<Res<null>> {
  return req("DELETE", secretsPath(app, member) + "/" + id);
}

export function revealSecret(app: string, member: string, id: string, version?: number): Promise<Res<SecretValue>> {
  return req("POST", secretsPath(app, member) + "/" + id + "/reveal", version ? { version: version } : {});
}

export function secretVersions(app: string, member: string, id: string): Promise<Res<SecretVersion[]>> {
  return req("GET", secretsPath(app, member) + "/" + id + "/versions");
}

// ---------- chaves de API ----------

// A rota de chaves é a mesma dos outros serviços; o dono vai na query.
function tokensPath(app: string, member: string, sub: string = ""): string {
  return "/api-keys" + sub + "?application_id=" + encodeURIComponent(app) + "&member_id=" + encodeURIComponent(member);
}

export function listTokens(app: string, member: string = "me"): Promise<Res<Token[]>> {
  return req("GET", tokensPath(app, member));
}

export function createToken(app: string, member: string, name: string, expiresAt: string | null): Promise<Res<Token>> {
  const body: { name: string; type: string; expires_at?: string } = { name: name, type: "secret" };
  if (expiresAt) {
    body.expires_at = expiresAt;
  }
  return req("POST", tokensPath(app, member), body);
}

export function revokeToken(app: string, member: string, id: string): Promise<Res<null>> {
  return req("DELETE", tokensPath(app, member, "/" + encodeURIComponent(id)));
}
