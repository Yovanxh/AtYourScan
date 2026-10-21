import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgres://postgres:AyS%232026_9xPzK8lYtueWTt!Db@db.mdijiutvafaszcnolwee.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid) AS constraint_def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'cafes';
  `);
  console.log('Constraints on cafes:', res.rows);
  await client.end();
}
run();
