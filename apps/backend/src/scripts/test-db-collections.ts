import { getSupabaseServerClient } from '../infrastructure/supabase';

async function main() {
  const supabase = getSupabaseServerClient();
  const { data: cols, error: err1 } = await supabase.from('collections_templatedhub').select('*');
  console.log('Collections in Supabase:', cols?.length, 'error:', err1);

  const { data: colAssets, error: err2 } = await supabase.from('collection_assets_templatedhub').select('*');
  console.log('Collection Assets in Supabase:', colAssets?.length, 'error:', err2);

  const { data: usages, error: err3 } = await supabase.from('asset_usages_templatedhub').select('*').limit(5);
  console.log('Usages in Supabase:', usages?.length, 'error:', err3);
}

main();
