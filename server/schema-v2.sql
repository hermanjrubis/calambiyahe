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
ALTER TABLE IF EXISTS places DROP COLUMN IF EXISTS parent_terminal_id CASCADE;
DROP TABLE IF EXISTS terminals CASCADE;

-- 1. ORIGINAL CORE TABLES (with v2 additions)
CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    barangay VARCHAR(100),
    municipality VARCHAR(100),
    image_path TEXT,
    description TEXT,
    location GEOGRAPHY(POINT, 4326),
    is_active BOOLEAN DEFAULT TRUE
);

-- Safe migrations for existing databases
ALTER TABLE places ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE places ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE places ADD COLUMN IF NOT EXISTS full_address TEXT;
ALTER TABLE places ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE places ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE places ADD COLUMN IF NOT EXISTS opening_hours JSONB;

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

-- 4. USERS (Firebase Authentication Sync)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,      -- Firebase uid
    email VARCHAR(255),
    display_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Safe migrations for existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- 5. PLACE IMAGES & RATINGS
CREATE TABLE IF NOT EXISTS place_images (
    id SERIAL PRIMARY KEY,
    place_id INT REFERENCES places(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    display_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS place_ratings (
    id SERIAL PRIMARY KEY,
    place_id INT REFERENCES places(id) ON DELETE CASCADE,
    user_id VARCHAR(128) REFERENCES users(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment_text TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Safe migrations for existing place_ratings table
ALTER TABLE place_ratings ADD COLUMN IF NOT EXISTS user_id VARCHAR(128) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE place_ratings ADD COLUMN IF NOT EXISTS comment_text TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_place_user_rating'
    ) THEN
        ALTER TABLE place_ratings ADD CONSTRAINT unique_place_user_rating UNIQUE (place_id, user_id);
    END IF;
END $$;


