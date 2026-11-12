import { onboardAllRemainingWebsiteTemplates } from '../modules/website-importer/catalog-onboarding.service';
import { getSupabaseServerClient } from '../infrastructure/supabase';

async function main() {
  console.log('Starting full website catalog onboarding to Supabase...');
  try {
    const report = await onboardAllRemainingWebsiteTemplates();
    console.log('Onboarding Report:', {
      attemptedCount: report.attemptedCount,
      successfulCount: report.successfulCount,
      failedCount: report.failedCount,
      websiteMastersTotal: report.websiteMastersTotal,
      libraryMastersTotal: report.libraryMastersTotal,
    });

    const supabase = getSupabaseServerClient();
    const { count, error } = await supabase
      .from('assets_templatedhub')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true);

    if (error) {
      console.error('Error querying Supabase:', error);
    } else {
      console.log('TOTAL PUBLISHED MASTERS IN SUPABASE:', count);
    }
  } catch (err) {
    console.error('Onboarding script error:', err);
  }
}

main();
