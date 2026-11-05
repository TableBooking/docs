-- TARGET SCHEMA V2: operations_db: ONLY service allowed to transition reservation state / allocate table
CREATE TABLE IF NOT EXISTS restaurants (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
 phone TEXT, timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
 cancel_before_minutes INT NOT NULL DEFAULT 120 CHECK (cancel_before_minutes >= 0),
 checkin_early_minutes INT NOT NULL DEFAULT 30 CHECK (checkin_early_minutes >= 0),
 no_show_after_minutes INT NOT NULL DEFAULT 15 CHECK (no_show_after_minutes >= 0)
);
CREATE TABLE IF NOT EXISTS dining_areas (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS dining_tables (
 id TEXT PRIMARY KEY, area_id TEXT NOT NULL REFERENCES dining_areas(id),
 name TEXT, capacity INT NOT NULL CHECK(capacity > 0), active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS service_slot_configs (
 code TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 starts_at_local TIME NOT NULL, ends_at_local TIME NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 CHECK (ends_at_local > starts_at_local)
);
CREATE TABLE IF NOT EXISTS reservations (
 id UUID PRIMARY KEY, customer_id UUID NOT NULL, contact_email TEXT NOT NULL,
 contact_phone TEXT, slot_id TEXT NOT NULL,
 party_size INT NOT NULL CHECK(party_size BETWEEN 1 AND 12),
 note TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL CHECK(state IN ('REQUESTED','CONFIRMED','REJECTED','CANCELLED','CHECKED_IN','SEATED','COMPLETED','NO_SHOW')),
 aggregate_version INT NOT NULL CHECK (aggregate_version >= 1),
 table_id TEXT REFERENCES dining_tables(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(slot_id ~ '^\d{4}-\d{2}-\d{2}-(lunch|dinner)$')
);
CREATE INDEX IF NOT EXISTS ix_ops_slot_state ON reservations(slot_id,state,created_at DESC);
CREATE TABLE IF NOT EXISTS table_allocations (
 id UUID PRIMARY KEY, booking_id UUID NOT NULL REFERENCES reservations(id),
 table_id TEXT NOT NULL REFERENCES dining_tables(id),slot_id TEXT NOT NULL,
 allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 released_at TIMESTAMPTZ,
 CONSTRAINT ux_allocation_per_booking UNIQUE (booking_id)
);
-- Cancelled/no-show releases allocation; COMPLETED must keep occupancy record for the elapsed slot.
CREATE UNIQUE INDEX IF NOT EXISTS ux_active_table_slot
 ON table_allocations(table_id,slot_id) WHERE released_at IS NULL;
CREATE TABLE IF NOT EXISTS pending_cancellations (
 command_id UUID PRIMARY KEY, booking_id UUID NOT NULL, customer_id UUID NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS processed_commands (
 command_id UUID PRIMARY KEY, booking_id UUID NOT NULL,
 result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inbox_events (
 event_id UUID PRIMARY KEY, aggregate_id UUID NOT NULL,
 processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox_events (
 event_id UUID PRIMARY KEY, aggregate_id UUID NOT NULL, routing_key TEXT NOT NULL,
 payload JSONB NOT NULL, attempts INT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_ops_outbox_pending ON outbox_events(created_at) WHERE published_at IS NULL;
