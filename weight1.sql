-- ============================================
-- WeighGuard IOT System - Normalized Database Schema
-- PostgreSQL Version with Transaction Management
-- Created: January 22, 2026
-- ============================================

-- Create ENUM types first
BEGIN;

CREATE TYPE user_status_enum AS ENUM ('active', 'inactive', 'pending', 'suspended');
CREATE TYPE assignment_status_enum AS ENUM ('in_transit', 'idle', 'unassigned', 'completed', 'cancelled');
CREATE TYPE vehicle_status_enum AS ENUM ('active', 'idle', 'maintenance', 'offline', 'garage');
CREATE TYPE cargo_status_enum AS ENUM ('secure', 'loss_alert', 'warning', 'critical');
CREATE TYPE notification_type_enum AS ENUM ('alert', 'warning', 'info', 'success');

COMMIT;

-- Create all tables in order (respecting foreign key dependencies)
BEGIN;

-- TABLE: users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    is_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(6),
    verification_code_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE NULL
);

-- TABLE: assignments
CREATE TABLE assignments (
    id SERIAL PRIMARY KEY,
    driver_id INT REFERENCES users(id), -- Links to your User table
    vehicle_number VARCHAR(20) NOT NULL,
    
    -- Pickup Details
    pickup_lat DECIMAL(10, 6) NOT NULL,
    pickup_lng DECIMAL(10, 6) NOT NULL,
    pickup_address TEXT, -- Optional: store the text address if you have it
    
    -- Destination Details
    dest_lat DECIMAL(10, 6) NOT NULL,
    dest_lng DECIMAL(10, 6) NOT NULL,
    dest_address TEXT,
    
    -- Trip Stats (From the OSRM calculation)
    distance_km DECIMAL(10, 2),
    est_duration_min INT,
    
    status VARCHAR(20) DEFAULT 'pending', -- pending, active, completed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- TABLE: vehicles
CREATE TABLE vehicles (
    vehicle_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vehicle_code VARCHAR(20) UNIQUE NOT NULL,
    vehicle_name VARCHAR(100),
    status vehicle_status_enum DEFAULT 'idle',
    battery_level INTEGER DEFAULT 100 CHECK (battery_level >= 0 AND battery_level <= 100),
    last_maintenance_date DATE NULL,
    next_maintenance_date DATE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- TABLE: locations
CREATE TABLE locations (
    location_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    location_name VARCHAR(100) NOT NULL,
    location_type VARCHAR(50),
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT valid_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL) OR
        (latitude >= -90 AND latitude <= 90 AND longitude >= -180 AND longitude <= 180)
    )
);

-- TABLE: assignments
CREATE TABLE assignments (
    assignment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    vehicle_id UUID,
    pickup_location_id UUID,
    destination_location_id UUID,
    status assignment_status_enum DEFAULT 'unassigned',
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE NULL,
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    estimated_duration_minutes INTEGER,
    notes TEXT,
    created_by UUID,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT fk_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE SET NULL,
    CONSTRAINT fk_pickup_location FOREIGN KEY (pickup_location_id) REFERENCES locations(location_id) ON DELETE SET NULL,
    CONSTRAINT fk_destination_location FOREIGN KEY (destination_location_id) REFERENCES locations(location_id) ON DELETE SET NULL,
    CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- TABLE: location_tracking
CREATE TABLE location_tracking (
    tracking_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    vehicle_id UUID,
    assignment_id UUID,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    altitude NUMERIC(8, 2),
    speed NUMERIC(5, 2),
    heading NUMERIC(5, 2),
    accuracy NUMERIC(6, 2),
    location_name VARCHAR(100),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_tracking_coordinates CHECK (
        latitude >= -90 AND latitude <= 90 AND
        longitude >= -180 AND longitude <= 180
    ),
    CONSTRAINT fk_tracking_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_tracking_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
    CONSTRAINT fk_tracking_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE
);

-- TABLE: cargo_loads
CREATE TABLE cargo_loads (
    cargo_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    assignment_id UUID,
    vehicle_id UUID,
    user_id UUID,
    initial_load_kg NUMERIC(10, 2) NOT NULL CHECK (initial_load_kg >= 0),
    current_load_kg NUMERIC(10, 2) NOT NULL CHECK (current_load_kg >= 0),
    final_load_kg NUMERIC(10, 2) CHECK (final_load_kg >= 0),
    cargo_status cargo_status_enum DEFAULT 'secure',
    load_recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    unload_recorded_at TIMESTAMP WITH TIME ZONE NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_cargo_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
    CONSTRAINT fk_cargo_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE SET NULL,
    CONSTRAINT fk_cargo_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- TABLE: cargo_integrity_logs
CREATE TABLE cargo_integrity_logs (
    log_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cargo_id UUID,
    assignment_id UUID,
    user_id UUID,
    vehicle_id UUID,
    pickup_location_id UUID,
    destination_location_id UUID,
    route_segment VARCHAR(200),
    initial_load_kg NUMERIC(10, 2) NOT NULL,
    final_load_kg NUMERIC(10, 2) NOT NULL,
    weight_loss_kg NUMERIC(10, 2) GENERATED ALWAYS AS (initial_load_kg - final_load_kg) STORED,
    incident_latitude NUMERIC(10, 8),
    incident_longitude NUMERIC(11, 8),
    status cargo_status_enum DEFAULT 'secure',
    notes TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_cargo FOREIGN KEY (cargo_id) REFERENCES cargo_loads(cargo_id) ON DELETE CASCADE,
    CONSTRAINT fk_log_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
    CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT fk_log_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE SET NULL,
    CONSTRAINT fk_log_pickup FOREIGN KEY (pickup_location_id) REFERENCES locations(location_id) ON DELETE SET NULL,
    CONSTRAINT fk_log_destination FOREIGN KEY (destination_location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);

-- TABLE: user_activity_stats
CREATE TABLE user_activity_stats (
    stat_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    in_transit_users INTEGER DEFAULT 0,
    unassigned_users INTEGER DEFAULT 0,
    pending_users INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_stat_date UNIQUE(stat_date)
);

-- TABLE: notifications
CREATE TABLE notifications (
    notification_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    notification_type notification_type_enum DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    related_entity_type VARCHAR(50),
    related_entity_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- TABLE: password_reset_tokens
CREATE TABLE password_reset_tokens (
    token_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

COMMIT;

-- Create indexes
BEGIN;

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_created_at ON users(created_at DESC);

CREATE INDEX idx_vehicles_code ON vehicles(vehicle_code);
CREATE INDEX idx_vehicles_status ON vehicles(status) WHERE is_deleted = FALSE;

CREATE INDEX idx_locations_name ON locations(location_name);
CREATE INDEX idx_locations_type ON locations(location_type);
CREATE INDEX idx_locations_coordinates ON locations(latitude, longitude) WHERE latitude IS NOT NULL;

CREATE INDEX idx_assignments_user_id ON assignments(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_assignments_vehicle_id ON assignments(vehicle_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_assignments_status ON assignments(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_assignments_assigned_at ON assignments(assigned_at DESC);

CREATE INDEX idx_location_tracking_user_id ON location_tracking(user_id, recorded_at DESC);
CREATE INDEX idx_location_tracking_vehicle_id ON location_tracking(vehicle_id, recorded_at DESC);
CREATE INDEX idx_location_tracking_assignment_id ON location_tracking(assignment_id, recorded_at DESC);
CREATE INDEX idx_location_tracking_recorded_at ON location_tracking(recorded_at DESC);

CREATE INDEX idx_cargo_loads_assignment_id ON cargo_loads(assignment_id);
CREATE INDEX idx_cargo_loads_vehicle_id ON cargo_loads(vehicle_id);
CREATE INDEX idx_cargo_loads_user_id ON cargo_loads(user_id);
CREATE INDEX idx_cargo_loads_status ON cargo_loads(cargo_status);

CREATE INDEX idx_cargo_integrity_cargo_id ON cargo_integrity_logs(cargo_id);
CREATE INDEX idx_cargo_integrity_assignment_id ON cargo_integrity_logs(assignment_id);
CREATE INDEX idx_cargo_integrity_user_id ON cargo_integrity_logs(user_id);
CREATE INDEX idx_cargo_integrity_status ON cargo_integrity_logs(status);
CREATE INDEX idx_cargo_integrity_timestamp ON cargo_integrity_logs(timestamp DESC);
CREATE INDEX idx_cargo_integrity_weight_loss ON cargo_integrity_logs(weight_loss_kg DESC) WHERE weight_loss_kg > 0;

CREATE INDEX idx_user_activity_stat_date ON user_activity_stats(stat_date DESC);

CREATE INDEX idx_notifications_user_id ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX idx_password_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_expires_at ON password_reset_tokens(expires_at);

COMMIT;

-- Create views
BEGIN;

CREATE OR REPLACE VIEW v_user_dashboard_summary AS
SELECT 
    u.user_id,
    u.first_name,
    u.last_name,
    CONCAT(u.first_name, ' ', u.last_name) AS user_name,
    u.email,
    u.status AS user_status,
    u.created_at,
    u.last_login,
    COALESCE(a.status::TEXT, 'unassigned') AS assignment_status,
    v.vehicle_id,
    v.vehicle_code,
    v.battery_level,
    v.status AS vehicle_status,
    pl.location_name AS pickup_location,
    dl.location_name AS destination_location,
    CASE 
        WHEN pl.location_name IS NOT NULL AND dl.location_name IS NOT NULL 
        THEN CONCAT(pl.location_name, ' → ', dl.location_name)
        ELSE NULL
    END AS route_segment,
    lt.latitude AS current_latitude,
    lt.longitude AS current_longitude,
    lt.location_name AS current_location_name,
    lt.recorded_at AS last_location_update
FROM users u
LEFT JOIN LATERAL (
    SELECT * FROM assignments
    WHERE user_id = u.user_id 
    AND status IN ('in_transit', 'idle')
    AND is_deleted = FALSE
    ORDER BY assigned_at DESC
    LIMIT 1
) a ON TRUE
LEFT JOIN vehicles v ON a.vehicle_id = v.vehicle_id AND v.is_deleted = FALSE
LEFT JOIN locations pl ON a.pickup_location_id = pl.location_id AND pl.is_deleted = FALSE
LEFT JOIN locations dl ON a.destination_location_id = dl.location_id AND dl.is_deleted = FALSE
LEFT JOIN LATERAL (
    SELECT latitude, longitude, location_name, recorded_at
    FROM location_tracking
    WHERE user_id = u.user_id
    ORDER BY recorded_at DESC
    LIMIT 1
) lt ON TRUE
WHERE u.is_deleted = FALSE
ORDER BY u.created_at DESC;

CREATE OR REPLACE VIEW v_active_assignments AS
SELECT 
    a.assignment_id,
    a.status,
    a.assigned_at,
    a.started_at,
    a.completed_at,
    u.user_id,
    CONCAT(u.first_name, ' ', u.last_name) AS user_name,
    u.email AS user_email,
    u.status AS user_status,
    v.vehicle_id,
    v.vehicle_code,
    v.status AS vehicle_status,
    v.battery_level,
    pl.location_name AS pickup_location,
    pl.latitude AS pickup_latitude,
    pl.longitude AS pickup_longitude,
    dl.location_name AS destination_location,
    dl.latitude AS destination_latitude,
    dl.longitude AS destination_longitude,
    CONCAT(pl.location_name, ' → ', dl.location_name) AS route_segment
FROM assignments a
LEFT JOIN users u ON a.user_id = u.user_id AND u.is_deleted = FALSE
LEFT JOIN vehicles v ON a.vehicle_id = v.vehicle_id AND v.is_deleted = FALSE
LEFT JOIN locations pl ON a.pickup_location_id = pl.location_id AND pl.is_deleted = FALSE
LEFT JOIN locations dl ON a.destination_location_id = dl.location_id AND dl.is_deleted = FALSE
WHERE a.is_deleted = FALSE
    AND a.status NOT IN ('completed', 'cancelled');

CREATE OR REPLACE VIEW v_cargo_incidents AS
SELECT 
    cil.log_id,
    cil.timestamp,
    cil.route_segment,
    cil.initial_load_kg,
    cil.final_load_kg,
    cil.weight_loss_kg,
    cil.status,
    cil.incident_latitude,
    cil.incident_longitude,
    cil.notes,
    u.user_id,
    CONCAT(u.first_name, ' ', u.last_name) AS driver_name,
    u.email AS driver_email,
    v.vehicle_code,
    a.assignment_id
FROM cargo_integrity_logs cil
LEFT JOIN users u ON cil.user_id = u.user_id
LEFT JOIN vehicles v ON cil.vehicle_id = v.vehicle_id
LEFT JOIN assignments a ON cil.assignment_id = a.assignment_id
ORDER BY cil.timestamp DESC;

COMMIT;

-- Create trigger functions
BEGIN;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_user_activity_stats()
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_activity_stats (
        stat_date,
        total_users,
        active_users,
        in_transit_users,
        unassigned_users,
        pending_users,
        updated_at
    )
    VALUES (
        CURRENT_DATE,
        (SELECT COUNT(*) FROM users WHERE is_deleted = FALSE),
        (SELECT COUNT(*) FROM users WHERE status = 'active' AND is_deleted = FALSE),
        (SELECT COUNT(DISTINCT user_id) FROM assignments 
         WHERE status = 'in_transit' AND is_deleted = FALSE),
        (SELECT COUNT(*) FROM users u 
         WHERE u.is_deleted = FALSE 
         AND NOT EXISTS (
             SELECT 1 FROM assignments a 
             WHERE a.user_id = u.user_id 
             AND a.status IN ('in_transit', 'idle') 
             AND a.is_deleted = FALSE
         )),
        (SELECT COUNT(*) FROM users WHERE status = 'pending' AND is_deleted = FALSE),
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (stat_date) 
    DO UPDATE SET
        total_users = EXCLUDED.total_users,
        active_users = EXCLUDED.active_users,
        in_transit_users = EXCLUDED.in_transit_users,
        unassigned_users = EXCLUDED.unassigned_users,
        pending_users = EXCLUDED.pending_users,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION detect_cargo_loss()
RETURNS TRIGGER AS $$
DECLARE
    weight_difference NUMERIC(10, 2);
    loss_threshold NUMERIC(10, 2) := 5.0;
    v_assignment assignments%ROWTYPE;
BEGIN
    weight_difference := OLD.current_load_kg - NEW.current_load_kg;
    
    IF weight_difference > loss_threshold THEN
        NEW.cargo_status := 'loss_alert';
        
        SELECT * INTO v_assignment FROM assignments WHERE assignment_id = NEW.assignment_id;
        
        INSERT INTO cargo_integrity_logs (
            cargo_id, assignment_id, user_id, vehicle_id,
            pickup_location_id, destination_location_id, route_segment,
            initial_load_kg, final_load_kg, status, notes, timestamp
        )
        VALUES (
            NEW.cargo_id, NEW.assignment_id, NEW.user_id, NEW.vehicle_id,
            v_assignment.pickup_location_id, v_assignment.destination_location_id,
            (SELECT CONCAT(pl.location_name, ' → ', dl.location_name)
             FROM locations pl, locations dl
             WHERE pl.location_id = v_assignment.pickup_location_id
             AND dl.location_id = v_assignment.destination_location_id),
            OLD.current_load_kg, NEW.current_load_kg, 'loss_alert',
            FORMAT('Weight loss of %s kg detected', weight_difference),
            CURRENT_TIMESTAMP
        );
        
        INSERT INTO notifications (
            user_id, title, message, notification_type,
            related_entity_type, related_entity_id
        )
        VALUES (
            NEW.user_id, 'Cargo Loss Alert',
            FORMAT('Weight loss of %s kg detected on vehicle %s', 
                   weight_difference, 
                   (SELECT vehicle_code FROM vehicles WHERE vehicle_id = NEW.vehicle_id)),
            'alert', 'cargo_loss', NEW.cargo_id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Create triggers
BEGIN;

CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_vehicles_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_assignments_updated_at
BEFORE UPDATE ON assignments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_detect_cargo_loss
BEFORE UPDATE ON cargo_loads
FOR EACH ROW
WHEN (NEW.current_load_kg < OLD.current_load_kg)
EXECUTE FUNCTION detect_cargo_loss();

COMMIT;

-- Insert sample data
BEGIN;

INSERT INTO locations (location_name, location_type, latitude, longitude, address) VALUES
    ('Warehouse A', 'warehouse', 34.0522, -118.2437, '123 Warehouse St, Los Angeles, CA'),
    ('Warehouse C', 'warehouse', 34.0689, -118.4452, '456 Storage Ave, Santa Monica, CA'),
    ('Zone A', 'zone', 33.9806, -118.1937, 'Zone A Industrial Area'),
    ('Zone B', 'zone', 34.1478, -118.1445, 'Zone B Distribution Center'),
    ('Port 4', 'port', 33.7701, -118.1937, 'Port 4 Terminal, Long Beach, CA'),
    ('Downtown LA', 'area', 34.0522, -118.2437, 'Downtown Los Angeles'),
    ('Depot', 'depot', 34.0407, -118.2468, 'Central Depot Location');

INSERT INTO vehicles (vehicle_code, vehicle_name, status, battery_level) VALUES
    ('RC-8802', 'Truck 8802', 'active', 85),
    ('RC-9211', 'Truck 9211', 'idle', 100),
    ('RC-0034', 'Truck 0034', 'idle', 92),
    ('RC-0055', 'Truck 0055', 'garage', 78);

INSERT INTO users (first_name, last_name, email, password_hash, status, created_at) VALUES
    ('John', 'Driver', 'j.driver@weighguard.io', '$2a$10$XYZ...hashedpassword...', 'active', '2024-01-15 08:00:00+00'),
    ('Sarah', 'Logistics', 's.logistics@weighguard.io', '$2a$10$ABC...hashedpassword...', 'pending', '2024-02-20 10:30:00+00'),
    ('Mike', 'Hauler', 'm.hauler@weighguard.io', '$2a$10$DEF...hashedpassword...', 'active', '2024-01-10 09:00:00+00');

COMMIT;

BEGIN;

INSERT INTO assignments (user_id, vehicle_id, pickup_location_id, destination_location_id, status, assigned_at, started_at)
VALUES (
    (SELECT user_id FROM users WHERE email = 'j.driver@weighguard.io'),
    (SELECT vehicle_id FROM vehicles WHERE vehicle_code = 'RC-8802'),
    (SELECT location_id FROM locations WHERE location_name = 'Warehouse A'),
    (SELECT location_id FROM locations WHERE location_name = 'Zone B'),
    'in_transit',
    CURRENT_TIMESTAMP - INTERVAL '2 hours',
    CURRENT_TIMESTAMP - INTERVAL '1 hour 45 minutes'
);

INSERT INTO location_tracking (user_id, vehicle_id, assignment_id, latitude, longitude, location_name, recorded_at)
SELECT 
    u.user_id, v.vehicle_id, a.assignment_id,
    34.0522, -118.2437, 'Downtown LA',
    CURRENT_TIMESTAMP - INTERVAL '5 minutes'
FROM users u
JOIN assignments a ON u.user_id = a.user_id
JOIN vehicles v ON a.vehicle_id = v.vehicle_id
WHERE u.email = 'j.driver@weighguard.io'
LIMIT 1;

INSERT INTO cargo_loads (assignment_id, vehicle_id, user_id, initial_load_kg, current_load_kg, cargo_status)
SELECT a.assignment_id, a.vehicle_id, a.user_id, 1200.00, 1200.00, 'secure'
FROM assignments a
WHERE a.status = 'in_transit'
LIMIT 1;

COMMIT;

BEGIN;

INSERT INTO cargo_integrity_logs (
    assignment_id, user_id, vehicle_id, pickup_location_id, destination_location_id,
    route_segment, initial_load_kg, final_load_kg, status, timestamp
) VALUES
    (
        (SELECT assignment_id FROM assignments WHERE status = 'in_transit' LIMIT 1),
        (SELECT user_id FROM users WHERE email = 'j.driver@weighguard.io'),
        (SELECT vehicle_id FROM vehicles WHERE vehicle_code = 'RC-8802'),
        (SELECT location_id FROM locations WHERE location_name = 'Warehouse A'),
        (SELECT location_id FROM locations WHERE location_name = 'Zone B'),
        'Warehouse A → Zone B', 1200.00, 1200.00, 'secure',
        CURRENT_TIMESTAMP - INTERVAL '2 days' + INTERVAL '8 hours 30 minutes'
    ),
    (
        (SELECT assignment_id FROM assignments WHERE status = 'in_transit' LIMIT 1),
        (SELECT user_id FROM users WHERE email = 'j.driver@weighguard.io'),
        (SELECT vehicle_id FROM vehicles WHERE vehicle_code = 'RC-8802'),
        (SELECT location_id FROM locations WHERE location_name = 'Zone B'),
        (SELECT location_id FROM locations WHERE location_name = 'Port 4'),
        'Zone B → Port 4', 1200.00, 1185.00, 'loss_alert',
        CURRENT_TIMESTAMP - INTERVAL '3 days' + INTERVAL '14 hours 15 minutes'
    ),
    (
        (SELECT assignment_id FROM assignments WHERE status = 'in_transit' LIMIT 1),
        (SELECT user_id FROM users WHERE email = 'j.driver@weighguard.io'),
        (SELECT vehicle_id FROM vehicles WHERE vehicle_code = 'RC-8802'),
        (SELECT location_id FROM locations WHERE location_name = 'Warehouse C'),
        (SELECT location_id FROM locations WHERE location_name = 'Zone A'),
        'Warehouse C → Zone A', 950.00, 950.00, 'secure',
        CURRENT_TIMESTAMP - INTERVAL '4 days' + INTERVAL '10 hours'
    );

SELECT calculate_user_activity_stats();

COMMIT;