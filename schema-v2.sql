-- ==========================================
-- CALZADA TRANSIT SYSTEM - FULL SCHEMA V2
-- PostgreSQL + PostGIS Required
-- ==========================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. ORIGINAL CORE TABLES (with v2 additions)
CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    barangay VARCHAR(100),
    municipality VARCHAR(100),
    location GEOGRAPHY(POINT, 4326),
    is_active BOOLEAN DEFAULT TRUE,
    -- V2 ADDITION: Terminal Dependency
    parent_terminal_id INT REFERENCES places(id)
);

CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    highway_ref VARCHAR(50),
    transport_type VARCHAR(50),
    base_fare NUMERIC(6,2),
    path GEOGRAPHY(LINESTRING, 4326)
);

CREATE TABLE IF NOT EXISTS route_stops (
    id SERIAL PRIMARY KEY,
    route_id INT REFERENCES routes(id) ON DELETE CASCADE,
    place_id INT REFERENCES places(id) ON DELETE CASCADE,
    stop_order INT NOT NULL,
    UNIQUE(route_id, place_id)
);

-- 2. NEW TABLES (TERMINAL DEPENDENCIES)
CREATE TABLE terminals (
    id SERIAL PRIMARY KEY,
    place_id INT UNIQUE REFERENCES places(id) ON DELETE CASCADE,
    terminal_code VARCHAR(20),        
    operator VARCHAR(255),            
    transport_types TEXT[],           
    operating_hours VARCHAR(100),     
    coverage_radius_m INT,            
    coverage_area GEOGRAPHY(POLYGON, 4326), 
    has_waiting_area BOOLEAN DEFAULT FALSE,
    has_comfort_room BOOLEAN DEFAULT FALSE,
    notes TEXT
);

CREATE TABLE terminal_routes (
    id SERIAL PRIMARY KEY,
    terminal_id INT REFERENCES terminals(id) ON DELETE CASCADE,
    route_id INT REFERENCES routes(id) ON DELETE CASCADE,
    is_origin BOOLEAN DEFAULT FALSE,  
    is_terminal_end BOOLEAN DEFAULT FALSE,
    UNIQUE(terminal_id, route_id)
);

CREATE TABLE terminal_stops (
    id SERIAL PRIMARY KEY,
    terminal_id INT REFERENCES terminals(id) ON DELETE CASCADE,
    stop_id INT REFERENCES places(id) ON DELETE CASCADE,
    avg_travel_time_mins INT,         
    avg_fare NUMERIC(6,2),            
    frequency_mins INT,               
    notes TEXT,
    UNIQUE(terminal_id, stop_id)
);

-- 3. SPATIAL & PERFORMANCE INDEXES
CREATE INDEX idx_places_location ON places USING GIST (location);
CREATE INDEX idx_routes_path ON routes USING GIST (path);
CREATE INDEX idx_terminals_coverage ON terminals USING GIST (coverage_area);
CREATE INDEX idx_places_parent_terminal ON places(parent_terminal_id);
CREATE INDEX idx_terminal_stops_terminal ON terminal_stops(terminal_id);
CREATE INDEX idx_terminal_stops_stop ON terminal_stops(stop_id);
