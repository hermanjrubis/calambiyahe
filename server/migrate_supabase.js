const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
});

async function runMigration() {
    let client;
    try {
        console.log('Connecting to Supabase PostgreSQL database...');
        client = await pool.connect();
        console.log('Successfully connected to Supabase!');

        // 1. Verify PostGIS
        const extCheck = await client.query("SELECT extname FROM pg_extension WHERE extname = 'postgis'");
        let postgisStatus = '';
        if (extCheck.rows.length > 0) {
            postgisStatus = 'PostGIS extension was ALREADY enabled.';
            console.log(postgisStatus);
        } else {
            console.log('PostGIS extension not found. Enabling PostGIS...');
            await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
            postgisStatus = 'PostGIS extension was NOT enabled initially, but was SUCCESSFULLY created.';
            console.log(postgisStatus);
        }

        // 2. Run Schema (schema-v2.sql)
        console.log('Applying server/schema-v2.sql to Supabase...');
        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema-v2.sql'), 'utf8');
        await client.query(schemaSql);
        console.log('Successfully executed server/schema-v2.sql without errors!');

        // 3. Run Seed (seed.sql)
        console.log('Applying server/seed.sql to Supabase...');
        const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
        await client.query(seedSql);
        console.log('Successfully executed server/seed.sql without errors!');

        // 4. Verify count & sample row
        const countRes = await client.query('SELECT COUNT(*) FROM places WHERE category = \'schools\'');
        console.log(`Seeded schools count in Supabase: ${countRes.rows[0].count}`);

        const sampleRes = await client.query(`
            SELECT id, name, category, barangay, municipality, image_path, description,
                   ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
            FROM places WHERE category = 'schools'
        `);
        console.log('Seeded sample data:', JSON.stringify(sampleRes.rows, null, 2));

        console.log('MIGRATION_COMPLETE_SUCCESS');
    } catch (err) {
        console.error('MIGRATION_FAILED_ERROR:', err);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

runMigration();
