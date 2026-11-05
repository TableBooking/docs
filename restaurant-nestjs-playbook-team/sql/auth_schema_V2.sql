-- TARGET SCHEMA V2: auth_db (NOT a drop-in migration from NestJS V1)
CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL,
 full_name VARCHAR(150) NOT NULL, phone VARCHAR(30),
 role VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER','STAFF','MANAGER')),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_email_ci ON users (lower(email));
CREATE TABLE IF NOT EXISTS refresh_sessions (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 device_label TEXT, last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON refresh_sessions(user_id, expires_at DESC);
-- Không seed mật khẩu nguyên văn / hash giả trong database. Tạo qua bootstrap script có hash.
