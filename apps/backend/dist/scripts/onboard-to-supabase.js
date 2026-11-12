"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const catalog_onboarding_service_1 = require("../modules/website-importer/catalog-onboarding.service");
const supabase_1 = require("../infrastructure/supabase");
async function main() {
    console.log('Starting full website catalog onboarding to Supabase...');
    try {
        const report = await (0, catalog_onboarding_service_1.onboardAllRemainingWebsiteTemplates)();
        console.log('Onboarding Report:', {
            attemptedCount: report.attemptedCount,
            successfulCount: report.successfulCount,
            failedCount: report.failedCount,
            websiteMastersTotal: report.websiteMastersTotal,
            libraryMastersTotal: report.libraryMastersTotal,
        });
        const supabase = (0, supabase_1.getSupabaseServerClient)();
        const { count, error } = await supabase
            .from('assets_templatedhub')
            .select('id', { count: 'exact', head: true })
            .eq('is_published', true);
        if (error) {
            console.error('Error querying Supabase:', error);
        }
        else {
            console.log('TOTAL PUBLISHED MASTERS IN SUPABASE:', count);
        }
    }
    catch (err) {
        console.error('Onboarding script error:', err);
    }
}
main();
