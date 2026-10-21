import { supabase } from '../supabase.js';

async function check() {
  if (!supabase) return;
  const { data, error } = await supabase.from('menu_items').select('*');
  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('menu_items count in Supabase:', data?.length);
    console.log(JSON.stringify(data?.slice(0, 10), null, 2));
  }
}
check();
