const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/postgres';

const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
});

async function run() {
    try {
        const client = await pool.connect();
        console.log('Connected to PostgreSQL database for migration & seeding...');

        // 1. Check count before migration/seeding
        let initialCount = 0;
        try {
            const countRes = await client.query('SELECT COUNT(*) FROM places');
            initialCount = parseInt(countRes.rows[0].count, 10);
            console.log(`Initial places count (before seeding): ${initialCount}`);
        } catch (e) {
            console.log('Places table does not exist yet (0 rows).');
            initialCount = 0;
        }

        // 2. Apply schema-v2.sql
        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema-v2.sql'), 'utf8');
        await client.query(schemaSql);
        console.log('Successfully applied schema-v2.sql!');

        // 3. Seed if empty
        const countResAfterSchema = await client.query('SELECT COUNT(*) FROM places');
        const countAfterSchema = parseInt(countResAfterSchema.rows[0].count, 10);

        if (countAfterSchema === 0) {
            console.log('Places table is empty. Executing seed.sql...');
            const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
            await client.query(seedSql);
            console.log('Successfully applied seed.sql!');
        } else {
            console.log(`Places table already has ${countAfterSchema} rows. Skipping seed.`);
        }

        // 4. Final count verification
        const finalCountRes = await client.query('SELECT COUNT(*) FROM places');
        console.log(`Final places count: ${finalCountRes.rows[0].count}`);

        client.release();
    } catch (err) {
        console.error('Migration/Seed Error:', err);
    } finally {
        await pool.end();
    }
}

run();
