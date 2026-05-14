-- ==========================================
-- CALZADA TRANSIT SYSTEM - SEED DATA
-- Terminals and Dependencies
-- ==========================================

-- 1. Insert Base Places (Terminals and Stops)
INSERT INTO places (name, category, municipality, location) VALUES
('Calamba Crossing / Central Terminal', 'Terminal', 'Calamba', ST_SetSRID(ST_MakePoint(121.16315, 14.19821), 4326)),
('SM City Calamba / SM Transport Terminal', 'Terminal', 'Calamba', ST_SetSRID(ST_MakePoint(121.16335, 14.19895), 4326)),
('Turbina Bus Terminal', 'Terminal', 'Calamba', ST_SetSRID(ST_MakePoint(121.14444, 14.18888), 4326)),
('Sta. Cruz Bus Terminal (Pagsawitan)', 'Terminal', 'Sta. Cruz', ST_SetSRID(ST_MakePoint(121.41111, 14.28888), 4326)),
('San Pedro Public Market', 'Terminal', 'San Pedro', ST_SetSRID(ST_MakePoint(121.06666, 14.35555), 4326)),
('Halang Stop', 'Stop', 'Calamba', ST_SetSRID(ST_MakePoint(121.17777, 14.18888), 4326)),
('Pansol Stop', 'Stop', 'Calamba', ST_SetSRID(ST_MakePoint(121.18888, 14.17777), 4326)),
('Los Baños Junction (College)', 'Stop', 'Los Baños', ST_SetSRID(ST_MakePoint(121.23333, 14.16666), 4326)),
('UPLB Main Gate', 'Stop', 'Los Baños', ST_SetSRID(ST_MakePoint(121.24444, 14.16666), 4326)),
('Bay Junction', 'Stop', 'Bay', ST_SetSRID(ST_MakePoint(121.28888, 14.18888), 4326)),
('Sta. Cruz Public Market', 'Stop', 'Sta. Cruz', ST_SetSRID(ST_MakePoint(121.42222, 14.27777), 4326))
ON CONFLICT DO NOTHING;

-- 2. Insert Terminals Extended Info

INSERT INTO terminals 
(place_id, terminal_code, operator, transport_types, operating_hours, coverage_radius_m, has_waiting_area, has_comfort_room) 
VALUES
-- Crossing Grand Terminal
((SELECT id FROM places WHERE name = 'Calamba Crossing / Central Terminal'),
 'CCT', 'KMPC (Kalayaan Multi-Purpose Cooperative)',
 '{Jeepney, UV Express}', '4:00 AM – 10:00 PM', 3000, TRUE, TRUE),

-- SM Transport Terminal
((SELECT id FROM places WHERE name = 'SM City Calamba / SM Transport Terminal'),
 'SMT', 'HM Transport / LLI / P2P',
 '{Bus, P2P, UV Express}', '4:00 AM – 9:00 PM', 2000, TRUE, FALSE),

-- Turbina Bus Terminal
((SELECT id FROM places WHERE name = 'Turbina Bus Terminal'),
 'TBT', 'JAC Liner / DLTB / Philtranco / Superlines',
 '{Bus}', '24 hours', 1500, TRUE, TRUE),

-- Sta. Cruz Bus Terminal
((SELECT id FROM places WHERE name = 'Sta. Cruz Bus Terminal (Pagsawitan)'),
 'SCT', 'HM Liner / Worthy Transport',
 '{Bus, Jeepney}', '4:00 AM – 9:00 PM', 2500, TRUE, FALSE),

-- San Pedro Terminal
((SELECT id FROM places WHERE name = 'San Pedro Public Market'),
 'SPT', 'Various operators',
 '{Jeepney}', '5:00 AM – 9:00 PM', 2000, FALSE, FALSE);


-- Sample terminal_stops (CCT → N66 stops)
INSERT INTO terminal_stops (terminal_id, stop_id, avg_travel_time_mins, avg_fare, frequency_mins)
VALUES
((SELECT id FROM terminals WHERE terminal_code = 'CCT'),
 (SELECT id FROM places WHERE name = 'Halang Stop'), 10, 13.00, 10),

((SELECT id FROM terminals WHERE terminal_code = 'CCT'),
 (SELECT id FROM places WHERE name = 'Pansol Stop'), 20, 15.00, 10),

((SELECT id FROM terminals WHERE terminal_code = 'CCT'),
 (SELECT id FROM places WHERE name = 'Los Baños Junction (College)'), 35, 20.00, 15),

((SELECT id FROM terminals WHERE terminal_code = 'CCT'),
 (SELECT id FROM places WHERE name = 'UPLB Main Gate'), 40, 22.00, 15),

((SELECT id FROM terminals WHERE terminal_code = 'CCT'),
 (SELECT id FROM places WHERE name = 'Bay Junction'), 55, 28.00, 20),

((SELECT id FROM terminals WHERE terminal_code = 'CCT'),
 (SELECT id FROM places WHERE name = 'Sta. Cruz Public Market'), 90, 40.00, 30);
