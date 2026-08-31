-- Seed test data for places table
INSERT INTO places (name, category, barangay, municipality, location, is_active, image_path, description)
VALUES 
    (
        'City College of Calamba', 
        'schools', 
        'Real', 
        'Calamba', 
        ST_SetSRID(ST_MakePoint(121.1643, 14.2127), 4326)::geography, 
        TRUE, 
        NULL, 
        NULL
    ),
    (
        'STI College Calamba', 
        'schools', 
        'Real', 
        'Calamba', 
        ST_SetSRID(ST_MakePoint(121.1620, 14.1950), 4326)::geography, 
        TRUE, 
        NULL, 
        NULL
    );
