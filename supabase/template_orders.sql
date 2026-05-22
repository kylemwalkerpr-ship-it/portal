-- Table for template-pack orders purchased through the marketplace cart.
-- Guest checkout: no user_id foreign key; email is the buyer identifier.

CREATE TABLE IF NOT EXISTS template_orders (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email TEXT NOT NULL,
  name TEXT,
  slugs TEXT[] NOT NULL,
  amount_cents INTEGER NOT NULL,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  CHECK (status IN ('pending', 'paid', 'refunded', 'failed'))
);

CREATE INDEX IF NOT EXISTS template_orders_email_idx ON template_orders (email);
CREATE INDEX IF NOT EXISTS template_orders_status_idx ON template_orders (status);
CREATE INDEX IF NOT EXISTS template_orders_created_at_idx ON template_orders (created_at DESC);
