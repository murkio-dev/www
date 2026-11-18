// Validações feitas no navegador antes de chamar as APIs. Espelham as regras do servidor
// (identity/pkg/validate/password.go, vault/docs/api.md); a palavra final é sempre da API.

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// Política NIST do Identity: de 8 a 128 caracteres, sem espaço nas pontas.
export function passwordLengthOk(v: string): boolean {
  const n = Array.from(v).length;
  return n >= 8 && n <= 128;
}

export function passwordEdgesOk(v: string): boolean {
  return v !== "" && v === v.trim();
}

export function isPasswordOk(v: string): boolean {
  return passwordLengthOk(v) && passwordEdgesOk(v);
}

// Código de verificação do e-mail: 6 dígitos.
export function isCode(v: string): boolean {
  return /^[0-9]{6}$/.test(v.trim());
}

export function digitsOnly(v: string): string {
  return v.replace(/\D/g, "").slice(0, 6);
}

// Nome de aplicação do Vault: ^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$
export function isAppName(v: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(v);
}

// Nome de segredo do Vault: ^[A-Z][A-Z0-9_]{0,127}$
export function isSecretName(v: string): boolean {
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(v);
}

// Nome de token do Vault: só não pode ficar vazio nem gigante.
export function isTokenName(v: string): boolean {
  const n = v.trim().length;
  return n >= 1 && n <= 100;
}

// Classe de uma regra da lista: neutra com o campo vazio, ok ou bad depois de digitar.
export function ruleClass(v: string, ok: boolean, base: string): string {
  if (v === "") {
    return base;
  }
  return ok ? base + " " + base + "-ok" : base + " " + base + "-bad";
}

export function shortId(id: string): string {
  return id.length > 14 ? id.slice(0, 8) + "…" + id.slice(-4) : id;
}

export function fmtDate(iso: string | null, lang: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString(lang || "en", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | null, lang: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleString(lang || "en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Data de expiração de um token a partir da escolha do formulário ("" = nunca).
export function expiresFrom(choice: string, now: number = Date.now()): string | null {
  const days: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
  if (!days[choice]) {
    return null;
  }
  return new Date(now + days[choice] * 86400000).toISOString();
}

// Lê um parâmetro da query string atual ("" se não existe).
export function queryParam(search: string, name: string): string {
  try {
    return new URLSearchParams(search).get(name) || "";
  } catch (e) {
    return "";
  }
}

// Só aceita caminho interno como destino depois do login (evita redirect aberto).
export function safeNext(v: string): string {
  return /^\/[^/\\]/.test(v) ? v : "";
}
