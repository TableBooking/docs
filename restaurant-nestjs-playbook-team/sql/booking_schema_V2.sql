-- TARGET SCHEMA V2: booking_db
CREATE TABLE IF NOT EXISTS booking_requests (
 id UUID PRIMARY KEY, customer_id UUID NOT NULL, contact_email TEXT NOT NULL,
 contact_phone VARCHAR(30), slot_id TEXT NOT NULL,
 party_size INT NOT NULL CHECK (party_size BETWEEN 1 AND 12), note TEXT NOT NULL DEFAULT '',
 idempotency_key VARCHAR(128) NOT NULL, payload_hash VARCHAR(64) NOT NULL,
 processing_status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (processing_status IN ('QUEUED','PROCESSED','FAILED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT ux_request_idempotency UNIQUE (customer_id,idempotency_key),
 CONSTRAINT ck_slot_format CHECK(slot_id ~ '^\d{4}-\d{2}-\d{2}-(lunch|dinner)$')
);
CREATE INDEX IF NOT EXISTS ix_bookings_customer_date ON booking_requests(customer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS booking_projection (
 booking_id UUID PRIMARY KEY, customer_id UUID NOT NULL,
 state VARCHAR(20), aggregate_version INT NOT NULL DEFAULT 0 CHECK (aggregate_version >= 0),
 table_id TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cancellation_commands (
 command_id UUID PRIMARY KEY, booking_id UUID NOT NULL REFERENCES booking_requests(id),
 customer_id UUID NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
  CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
 reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_cancel_owner ON cancellation_commands(customer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS inbox_events (
 event_id UUID PRIMARY KEY, aggregate_id UUID NOT NULL, aggregate_version INT,
 processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox_events (
 event_id UUID PRIMARY KEY, aggregate_id UUID NOT NULL, routing_key TEXT NOT NULL,
 payload JSONB NOT NULL, attempts INT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_booking_outbox_pending ON outbox_events(created_at) WHERE published_at IS NULL;
