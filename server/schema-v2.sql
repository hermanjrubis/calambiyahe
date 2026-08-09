-- ==========================================
-- CALZADA TRANSIT SYSTEM - FULL SCHEMA V2
-- PostgreSQL + PostGIS Required
-- ==========================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 0. SAFE DROP SEQUENCE (IF CLEANING UP OLD TERMINAL TABLES)
-- Execution order: Spatial indexes -> Child junction tables -> FK columns -> Parent tables
DROP INDEX IF EXISTS idx_terminals_location;
DROP TABLE IF EXISTS terminal_stops CASCADE;
DROP TABLE IF EXISTS terminal_routes CASCADE;
ALTER TABLE places DROP COLUMN IF EXISTS parent_terminal_id CASCADE;
DROP TABLE IF EXISTS terminals CASCADE;

-- 1. ORIGINAL CORE TABLES (with v2 additions)
CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    barangay VARCHAR(100),
    municipality VARCHAR(100),
    location GEOGRAPHY(POINT, 4326),
    is_active BOOLEAN DEFAULT TRUE
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

-- 3. SPATIAL & PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_places_location ON places USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_routes_path ON routes USING GIST (path);
