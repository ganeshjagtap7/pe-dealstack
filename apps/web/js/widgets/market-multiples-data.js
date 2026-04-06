/**
 * PE OS — Market Multiples Reference Data
 *
 * Hardcoded sector multiples for v1. Refresh quarterly by editing this file.
 *
 * Sources: PitchBook, Capital IQ, public-comp aggregates as of the AS_OF date.
 * Numbers are illustrative ranges — never trade on these without verifying
 * with current data providers.
 */

(function() {
    'use strict';

    window.MARKET_MULTIPLES = {
        asOf: 'Q1 2026',
        disclaimer: 'Illustrative ranges only. Verify with PitchBook / Capital IQ before use.',
        sectors: [
            { sector: 'B2B SaaS',                evEbitda: '14 – 22x', evRevenue: '4 – 9x' },
            { sector: 'Healthcare Services',     evEbitda: '10 – 14x', evRevenue: '1.5 – 2.5x' },
            { sector: 'Industrials / Manufacturing', evEbitda: '7 – 10x',  evRevenue: '0.8 – 1.5x' },
            { sector: 'Consumer Brands',         evEbitda: '8 – 12x',  evRevenue: '1 – 2.5x' },
            { sector: 'Financial Services',      evEbitda: '8 – 12x',  evRevenue: '2 – 4x' },
            { sector: 'Tech-Enabled Services',   evEbitda: '11 – 16x', evRevenue: '2 – 4x' },
            { sector: 'Logistics / Distribution',evEbitda: '6 – 9x',   evRevenue: '0.6 – 1.2x' },
            { sector: 'Energy / Utilities',      evEbitda: '6 – 9x',   evRevenue: '1 – 2x' },
        ],
    };
})();
