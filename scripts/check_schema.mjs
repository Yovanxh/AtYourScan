import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgres://postgres:AyS%232026_9xPzK8lYtueWTt!Db@db.mdijiutvafaszcnolwee.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
async function run() {
  await client.connect();
  const resCafes = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'cafes';
  `);
  console.log('Cafes columns:', resCafes.rows);

  const resProfiles = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'profiles';
  `);
  console.log('Profiles columns:', resProfiles.rows);

  const resPolicies = await client.query(`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('cafes', 'profiles');
  `);
  console.log('Policies:', resPolicies.rows);

  await client.end();
}
run();
