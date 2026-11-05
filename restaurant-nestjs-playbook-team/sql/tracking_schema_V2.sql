-- TARGET SCHEMA V2: tracking_db, append-only (no cross-service FK)
CREATE TABLE IF NOT EXISTS reservation_history (
 event_id UUID PRIMARY KEY, booking_id UUID NOT NULL, customer_id UUID NOT NULL,
 aggregate_version INT NOT NULL CHECK(aggregate_version>=1),
 previous_state TEXT, state TEXT NOT NULL, actor_id TEXT, reason TEXT,
 occurred_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT ux_history_booking_version UNIQUE(booking_id,aggregate_version)
);
CREATE INDEX IF NOT EXISTS ix_history_booking ON reservation_history(booking_id,aggregate_version);
CREATE TABLE IF NOT EXISTS reservation_projection (
 booking_id UUID PRIMARY KEY, customer_id UUID NOT NULL, state TEXT NOT NULL,
 aggregate_version INT NOT NULL, gap_detected BOOLEAN NOT NULL DEFAULT FALSE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inbox_events (
 event_id UUID PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
