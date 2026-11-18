// Sessão do painel, guardada no navegador. Os tokens vêm do Identity (access de curta
// duração + refresh rotativo); quem os pede e renova é identity.ts. Aqui só o armazenamento.

export type Session = {
  access_token: string;
  refresh_token: string;
  // instante (ms desde a época) em que o access token vence
  expires_at: number;
  user_id: string;
  email: string;
};

const KEY = "murkio-session";

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const s = JSON.parse(raw) as Session;
    if (!s || typeof s.access_token !== "string" || typeof s.refresh_token !== "string") {
      return null;
    }
    return s;
  } catch (e) {
    return null;
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {}
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
}

export function hasSession(): boolean {
  return getSession() !== null;
}

// true quando o access token já venceu ou vence nos próximos 30 s
export function accessExpired(s: Session, now: number = Date.now()): boolean {
  return s.expires_at - 30000 <= now;
}

// Caminho do painel da pessoa logada ("" sem sessão).
export function panelPath(): string {
  const s = getSession();
  return s ? "/vault/" + s.user_id : "";
}
