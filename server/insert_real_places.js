const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const isRemoteDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
});

async function run() {
    const client = await pool.connect();
    try {
        // ── MALLS ─────────────────────────────────────────────

        // 1. SM City Calamba
        const smCheck = await client.query(`SELECT id FROM places WHERE LOWER(name) = LOWER('SM City Calamba') LIMIT 1`);
        if (smCheck.rows.length > 0) {
            await client.query(`
                UPDATE places SET
                    category = 'malls',
                    barangay = 'Real',
                    municipality = 'Calamba',
                    location = ST_SetSRID(ST_MakePoint(121.1545159, 14.203928), 4326)::geography,
                    full_address = 'National Road, Brgy. Real, Calamba City Triangle, 4027 Laguna',
                    is_active = TRUE
                WHERE id = $1
            `, [smCheck.rows[0].id]);
            console.log('SM City Calamba: updated existing row id=' + smCheck.rows[0].id);
        } else {
            await client.query(`
                INSERT INTO places (name, category, barangay, municipality, location, full_address, is_active)
                VALUES (
                    'SM City Calamba',
                    'malls',
                    'Real',
                    'Calamba',
                    ST_SetSRID(ST_MakePoint(121.1545159, 14.203928), 4326)::geography,
                    'National Road, Brgy. Real, Calamba City Triangle, 4027 Laguna',
                    TRUE
                )
            `);
            console.log('SM City Calamba: inserted fresh');
        }

        // 2. CityMall - Calamba
        const cmCheck = await client.query(`SELECT id FROM places WHERE LOWER(name) LIKE '%citymall%' AND LOWER(name) LIKE '%calamba%' LIMIT 1`);
        if (cmCheck.rows.length > 0) {
            await client.query(`
                UPDATE places SET
                    name = 'CityMall - Calamba',
                    category = 'malls',
                    barangay = 'Uno',
                    municipality = 'Calamba',
                    location = ST_SetSRID(ST_MakePoint(121.1604888, 14.1986374), 4326)::geography,
                    full_address = '4027 National Highway, Calamba, 4027 Laguna',
                    phone = '(049) 545 4332',
                    is_active = TRUE
                WHERE id = $1
            `, [cmCheck.rows[0].id]);
            console.log('CityMall - Calamba: updated existing row id=' + cmCheck.rows[0].id);
        } else {
            await client.query(`
                INSERT INTO places (name, category, barangay, municipality, location, full_address, phone, is_active)
                VALUES (
                    'CityMall - Calamba',
                    'malls',
                    'Uno',
                    'Calamba',
                    ST_SetSRID(ST_MakePoint(121.1604888, 14.1986374), 4326)::geography,
                    '4027 National Highway, Calamba, 4027 Laguna',
                    '(049) 545 4332',
                    TRUE
                )
            `);
            console.log('CityMall - Calamba: inserted fresh');
        }

        // 3. South Supermarket
        const ssCheck = await client.query(`SELECT id FROM places WHERE LOWER(name) LIKE '%south supermarket%' LIMIT 1`);
        if (ssCheck.rows.length > 0) {
            await client.query(`
                UPDATE places SET
                    category = 'malls',
                    barangay = 'Real',
                    municipality = 'Calamba',
                    location = ST_SetSRID(ST_MakePoint(121.1584071, 14.2030841), 4326)::geography,
                    full_address = 'Manila S Rd, Calamba, 4027 Laguna',
                    opening_hours = '{"daily": "8:30 AM - 8:30 PM"}'::jsonb,
                    is_active = TRUE
                WHERE id = $1
            `, [ssCheck.rows[0].id]);
            console.log('South Supermarket: updated existing row id=' + ssCheck.rows[0].id);
        } else {
            await client.query(`
                INSERT INTO places (name, category, barangay, municipality, location, full_address, opening_hours, is_active)
                VALUES (
                    'South Supermarket',
                    'malls',
                    'Real',
                    'Calamba',
                    ST_SetSRID(ST_MakePoint(121.1584071, 14.2030841), 4326)::geography,
                    'Manila S Rd, Calamba, 4027 Laguna',
                    '{"daily": "8:30 AM - 8:30 PM"}'::jsonb,
                    TRUE
                )
            `);
            console.log('South Supermarket: inserted fresh');
        }

        // ── SCHOOLS ───────────────────────────────────────────

        // 4. STI College - Calamba (update existing)
        const stiCheck = await client.query(`SELECT id FROM places WHERE LOWER(name) LIKE '%sti%college%calamba%' OR LOWER(name) LIKE '%sti%calamba%' LIMIT 1`);
        if (stiCheck.rows.length > 0) {
            await client.query(`
                UPDATE places SET
                    name = 'STI College - Calamba',
                    category = 'schools',
                    barangay = 'Real',
                    municipality = 'Calamba',
                    location = ST_SetSRID(ST_MakePoint(121.1583962, 14.2025089), 4326)::geography,
                    full_address = 'Manila S Rd, Calamba, 4027 Laguna',
                    phone = '(049) 502 8225',
                    website = 'sti.edu',
                    is_active = TRUE
                WHERE id = $1
            `, [stiCheck.rows[0].id]);
            console.log('STI College - Calamba: updated existing row id=' + stiCheck.rows[0].id);
        } else {
            await client.query(`
                INSERT INTO places (name, category, barangay, municipality, location, full_address, phone, website, is_active)
                VALUES (
                    'STI College - Calamba',
                    'schools',
                    'Real',
                    'Calamba',
                    ST_SetSRID(ST_MakePoint(121.1583962, 14.2025089), 4326)::geography,
                    'Manila S Rd, Calamba, 4027 Laguna',
                    '(049) 502 8225',
                    'sti.edu',
                    TRUE
                )
            `);
            console.log('STI College - Calamba: inserted fresh');
        }

        // 5. Saint Benilde International School
        const sbCheck = await client.query(`SELECT id FROM places WHERE LOWER(name) LIKE '%benilde%' LIMIT 1`);
        if (sbCheck.rows.length > 0) {
            await client.query(`
                UPDATE places SET
                    name = 'Saint Benilde International School (Calamba) Real Campus',
                    category = 'schools',
                    barangay = 'Real',
                    municipality = 'Calamba',
                    location = ST_SetSRID(ST_MakePoint(121.1519236, 14.1987583), 4326)::geography,
                    full_address = 'Real, Calamba, 4027 Laguna',
                    phone = '(049) 502 5139',
                    website = 'saintbenilde.edu.ph',
                    is_active = TRUE
                WHERE id = $1
            `, [sbCheck.rows[0].id]);
            console.log('Saint Benilde: updated existing row id=' + sbCheck.rows[0].id);
        } else {
            await client.query(`
                INSERT INTO places (name, category, barangay, municipality, location, full_address, phone, website, is_active)
                VALUES (
                    'Saint Benilde International School (Calamba) Real Campus',
                    'schools',
                    'Real',
                    'Calamba',
                    ST_SetSRID(ST_MakePoint(121.1519236, 14.1987583), 4326)::geography,
                    'Real, Calamba, 4027 Laguna',
                    '(049) 502 5139',
                    'saintbenilde.edu.ph',
                    TRUE
                )
            `);
            console.log('Saint Benilde: inserted fresh');
        }

        // 6. Real Elementary School
        const resCheck = await client.query(`SELECT id FROM places WHERE LOWER(name) LIKE '%real elementary%' LIMIT 1`);
        if (resCheck.rows.length > 0) {
            await client.query(`
                UPDATE places SET
                    category = 'schools',
                    barangay = 'Real',
                    municipality = 'Calamba',
                    location = ST_SetSRID(ST_MakePoint(121.1492457, 14.1987874), 4326)::geography,
                    full_address = '336 Real Rd, Real, Calamba, 4027 Laguna',
                    phone = '(049) 545 0901',
                    opening_hours = '{"daily": "Open 24 hours"}'::jsonb,
                    is_active = TRUE
                WHERE id = $1
            `, [resCheck.rows[0].id]);
            console.log('Real Elementary School: updated existing row id=' + resCheck.rows[0].id);
        } else {
            await client.query(`
                INSERT INTO places (name, category, barangay, municipality, location, full_address, phone, opening_hours, is_active)
                VALUES (
                    'Real Elementary School',
                    'schools',
                    'Real',
                    'Calamba',
                    ST_SetSRID(ST_MakePoint(121.1492457, 14.1987874), 4326)::geography,
                    '336 Real Rd, Real, Calamba, 4027 Laguna',
                    '(049) 545 0901',
                    '{"daily": "Open 24 hours"}'::jsonb,
                    TRUE
                )
            `);
            console.log('Real Elementary School: inserted fresh');
        }

        // 7. PWU CDCEC Calamba
        const pwuCheck = await client.query(`SELECT id FROM places WHERE LOWER(name) LIKE '%pwu%' LIMIT 1`);
        if (pwuCheck.rows.length > 0) {
            await client.query(`
                UPDATE places SET
                    category = 'schools',
                    barangay = 'Uno',
                    municipality = 'Calamba',
                    location = ST_SetSRID(ST_MakePoint(121.1562636, 14.2052421), 4326)::geography,
                    full_address = '6544+3HW, Bridge, Calamba, 4027 Laguna',
                    phone = '(049) 508 1963',
                    is_active = TRUE
                WHERE id = $1
            `, [pwuCheck.rows[0].id]);
            console.log('PWU CDCEC Calamba: updated existing row id=' + pwuCheck.rows[0].id);
        } else {
            await client.query(`
                INSERT INTO places (name, category, barangay, municipality, location, full_address, phone, is_active)
                VALUES (
                    'PWU CDCEC Calamba',
                    'schools',
                    'Uno',
                    'Calamba',
                    ST_SetSRID(ST_MakePoint(121.1562636, 14.2052421), 4326)::geography,
                    '6544+3HW, Bridge, Calamba, 4027 Laguna',
                    '(049) 508 1963',
                    TRUE
                )
            `);
            console.log('PWU CDCEC Calamba: inserted fresh');
        }

        // ── VERIFY ────────────────────────────────────────────
        console.log('\n=== VERIFICATION: All malls and schools in DB ===\n');
        const verify = await client.query(`
            SELECT id, name, category,
                   ST_Y(location::geometry) AS lat,
                   ST_X(location::geometry) AS lng,
                   full_address
            FROM places
            WHERE category IN ('malls', 'schools') AND is_active = TRUE
            ORDER BY category, name
        `);
        console.table(verify.rows);

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
