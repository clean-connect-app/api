export interface ILoginAttempt {
  verifier: string;
  nonce: string;
  return_to: string;
}

export interface ILoginResult {
  returnTo: string;
  token?: string;
}

export interface IAccountSessionRow {
  account_id: string;
}

export interface IAccountIdRow {
  id: string;
}
