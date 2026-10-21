/**
 * AtYourScan - Restore Paused Supabase Project
 *
 * Usage:
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_xxx"
 *   node scripts/restore_project.mjs
 */

const projectRef = 'mdijiutvafaszcnolwee';
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.log('Please provide SUPABASE_ACCESS_TOKEN as an environment variable.');
  process.exit(1);
}

async function restore() {
  console.log(`Sending restore request for project: ${projectRef}...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/restore`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.ok) {
    console.log('✅ Project restore initiated successfully! It will be active in 1-2 minutes.');
  } else {
    const err = await res.text();
    console.error('Failed to restore project:', res.status, err);
  }
}

restore();
