CREATE TABLE organizations (
  id text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE points (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  phone text NOT NULL,
  slot_capacity integer NOT NULL CHECK (slot_capacity > 0),
  minimum_return_days integer NOT NULL CHECK (minimum_return_days > 0)
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE login_attempts (
  state_hash text PRIMARY KEY,
  verifier text NOT NULL,
  nonce text NOT NULL,
  return_to text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE orders (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  point_id text NOT NULL REFERENCES points(id),
  request_key uuid NOT NULL,
  request_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'assigned', 'collected', 'ready', 'delivered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL,
  UNIQUE (account_id, request_key),
  UNIQUE (id, point_id)
);

CREATE INDEX orders_account_recent ON orders (account_id, id DESC);

CREATE TABLE bookings (
  order_id integer NOT NULL,
  point_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pickup', 'return')),
  day date NOT NULL,
  slot_id text NOT NULL,
  PRIMARY KEY (order_id, kind),
  FOREIGN KEY (order_id, point_id) REFERENCES orders(id, point_id)
);

CREATE INDEX bookings_capacity ON bookings (point_id, kind, day, slot_id);

CREATE TABLE order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id),
  actor_id uuid NOT NULL REFERENCES accounts(id),
  actor_role text NOT NULL CHECK (actor_role IN ('customer', 'administrator', 'courier')),
  type text NOT NULL,
  order_version integer NOT NULL,
  happened_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, order_version)
);
