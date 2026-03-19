-- ==============================================================================
-- WEIGHGUARD: POSTGRESQL SCHEMA (Based on User's ER Diagram)
-- ==============================================================================

-- 1. ADMINISTRATORS & USERS
CREATE TABLE administrator (
    id BIGSERIAL PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    role VARCHAR(20),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(6),
    verification_expires TIMESTAMPTZ,
    status VARCHAR(20),
    login_at TIMESTAMPTZ,
    logout_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(6),
    verification_expires TIMESTAMPTZ,
    status VARCHAR(20),
    login_at TIMESTAMPTZ,
    logout_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- 2. VEHICLES
CREATE TABLE vehicles (
    id BIGSERIAL PRIMARY KEY,
    assigned_driver_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    vehicle_type VARCHAR(100),
    plate_number VARCHAR(50) UNIQUE,
    max_capacity_kg DECIMAL(10, 2),
    current_state VARCHAR(50),
    current_load_status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. DISPATCH TASKS
CREATE TABLE dispatch_tasks (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE CASCADE,
    pickup_lat DECIMAL(10, 8),
    pickup_lng DECIMAL(11, 8),
    destination_lat DECIMAL(10, 8),
    destination_lng DECIMAL(11, 8),
    status VARCHAR(20),
    initial_reference_weight_kg DECIMAL(10, 2),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ
);

-- 4. INCIDENTS
CREATE TABLE incidents (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    task_id BIGINT REFERENCES dispatch_tasks(id) ON DELETE CASCADE,
    incident_type VARCHAR(50),
    severity VARCHAR(20),
    weight_impact_kg DECIMAL(10, 2),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    status VARCHAR(50),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. TELEMETRY LOGS
CREATE TABLE telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE CASCADE,
    task_id BIGINT REFERENCES dispatch_tasks(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    speed_kmh BIGINT,
    current_weight_kg DECIMAL(10, 2),
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. NOTIFICATIONS
CREATE TABLE notification (
    id BIGSERIAL PRIMARY KEY,
    created_by BIGINT REFERENCES administrator(id) ON DELETE SET NULL,
    title VARCHAR(255),
    message TEXT,
    type VARCHAR(50),
    target_audience VARCHAR(50),
    priority VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_recipients (
    id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT REFERENCES notification(id) ON DELETE CASCADE,
    administrator_id BIGINT REFERENCES administrator(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- 7. LOGS (Suspension & Audit)
CREATE TABLE suspension_logs (
    id BIGSERIAL PRIMARY KEY,
    banned_by BIGINT REFERENCES administrator(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    administrator_id BIGINT REFERENCES administrator(id) ON DELETE CASCADE,
    reason TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    administrator_id BIGINT REFERENCES administrator(id) ON DELETE SET NULL,
    action VARCHAR(50),
    module VARCHAR(50),
    description TEXT,
    severity VARCHAR(20),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. SECURITY & SESSIONS
CREATE TABLE administrator_sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP NOT NULL
);

CREATE TABLE password_reset (
    id BIGSERIAL PRIMARY KEY,
    user_type VARCHAR(20),
    email VARCHAR(100),
    reset_code VARCHAR(6),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);