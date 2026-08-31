const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
});

async function run() {
    let client;
    try {
        client = await pool.connect();
        console.log('Connecting to Supabase PostgreSQL database...');

        // 1. DELETE City College of Calamba
        console.log('Deleting test entry "City College of Calamba"...');
        const delRes = await client.query("DELETE FROM places WHERE name = 'City College of Calamba'");
        console.log(`Deleted ${delRes.rowCount} row(s).`);

        // 2. APPLY SCHEMA CHANGES (schema-v2.sql)
        console.log('Applying updated schema-v2.sql...');
        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema-v2.sql'), 'utf8');
        await client.query(schemaSql);
        console.log('Successfully created place_images and place_ratings tables!');

        // 3. GET STI College Calamba place_id
        const stiRes = await client.query("SELECT id FROM places WHERE name ILIKE '%STI College Calamba%'");
        if (stiRes.rows.length === 0) {
            console.error('STI College Calamba not found in places table! Inserting default row...');
            await client.query(`
                INSERT INTO places (name, category, barangay, municipality, location, is_active, image_path, description)
                VALUES ('STI College Calamba', 'schools', 'Real', 'Calamba', ST_SetSRID(ST_MakePoint(121.1620, 14.1950), 4326)::geography, TRUE, '/assets/places/sti-college/sti-1.jpg', 'Higher Education campus along National Highway')
            `);
        }
        const stiIdRes = await client.query("SELECT id FROM places WHERE name ILIKE '%STI College Calamba%'");
        const stiId = stiIdRes.rows[0].id;
        console.log(`STI College Calamba ID: ${stiId}`);

        // Update image_path in places table for STI College Calamba
        await client.query("UPDATE places SET image_path = '/assets/places/sti-college/sti-1.jpg' WHERE id = $1", [stiId]);

        // 4. SEED PLACE IMAGES
        console.log('Seeding place_images for STI College Calamba...');
        // Clear existing images for STI to avoid duplicates on rerun
        await client.query('DELETE FROM place_images WHERE place_id = $1', [stiId]);

        const images = [
            { path: '/assets/places/sti-college/sti-1.jpg', order: 0 },
            { path: '/assets/places/sti-college/sti-2.jpg', order: 1 },
            { path: '/assets/places/sti-college/sti-3.jpg', order: 2 },
            { path: '/assets/places/sti-college/sti-4.jpg', order: 3 },
        ];

        for (const img of images) {
            await client.query(
                'INSERT INTO place_images (place_id, image_path, display_order) VALUES ($1, $2, $3)',
                [stiId, img.path, img.order]
            );
        }
        console.log('Successfully seeded 4 place_images!');

        // Optional initial rating seed if empty
        const ratingCountRes = await client.query('SELECT COUNT(*) FROM place_ratings WHERE place_id = $1', [stiId]);
        if (parseInt(ratingCountRes.rows[0].count, 10) === 0) {
            console.log('Seeding sample ratings for STI College Calamba...');
            await client.query('INSERT INTO place_ratings (place_id, rating) VALUES ($1, 5), ($1, 5), ($1, 4), ($1, 5)', [stiId]);
        }

        // 5. REPORT REMAINING ROWS IN PLACES
        const remaining = await client.query('SELECT id, name, category FROM places ORDER BY id ASC');
        console.log('\n--- REMAINING ROWS IN PLACES TABLE ---');
        console.table(remaining.rows);

        console.log('\nMIGRATION_AND_SEED_SUCCESSFUL');
    } catch (err) {
        console.error('Database Operation Error:', err);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

run();
