const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Connecting to PostgreSQL database...');
        console.log('Altering places table columns...');
        await client.query(`
            ALTER TABLE places ADD COLUMN IF NOT EXISTS full_address TEXT;
            ALTER TABLE places ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
            ALTER TABLE places ADD COLUMN IF NOT EXISTS website VARCHAR(255);
            ALTER TABLE places ADD COLUMN IF NOT EXISTS opening_hours JSONB;
        `);
        console.log('Columns added successfully.');

        console.log('Seeding STI College Calamba data...');
        const res = await client.query(`
            UPDATE places SET 
                full_address = 'Manila S Rd, Calamba, 4027 Laguna',
                phone = '(049) 502 8225',
                website = 'sti.edu',
                opening_hours = '{"mon":"8:00 AM - 5:00 PM","tue":"8:00 AM - 5:00 PM","wed":"8:00 AM - 5:00 PM","thu":"8:00 AM - 5:00 PM","fri":"8:00 AM - 5:00 PM","sat":"8:00 AM - 12:00 PM","sun":"Closed"}'::jsonb
            WHERE name ILIKE '%STI College Calamba%'
            RETURNING id, name, full_address, phone, website, opening_hours;
        `);
        console.log('Updated rows:');
        console.table(res.rows);
        console.log('Migration completed successfully!');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
