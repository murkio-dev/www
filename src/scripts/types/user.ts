export type UserIdentifier = {
  type: string;
  value: string;
  is_primary: boolean;
  verified_at: string | null;
  created_at: string;
};

export type UserSession = {
  id: string;
  ip: string;
  user_agent: string;
  last_used_at: string;
  expires_at: string;
  created_at: string;
};

export type UserMFA = {
  enrolled: boolean;
  confirmed_at: string | null;
  recovery_codes_left: number;
};

export type UserOAuthIdentity = {
  provider: string;
  subject: string;
  email: string;
  linked_at: string;
};

export type UserTermsAcceptance = {
  terms_id: string;
  version: number;
  accepted_at: string;
};

export type User = {
  // /v1/me
  id: string;
  session_id: string;
  email: string | null;
  email_verified: boolean;
  roles: string[];
  mfa_enabled: boolean;
  created_at: string;

  // entidade / export
  application_id: string;
  updated_at: string;
  deleted_at: string | null;
  banned_at: string | null;

  // export
  identifiers: UserIdentifier[];
  sessions: UserSession[];
  mfa: UserMFA;
  oauth_identities: UserOAuthIdentity[];
  terms_acceptances: UserTermsAcceptance[];
};
