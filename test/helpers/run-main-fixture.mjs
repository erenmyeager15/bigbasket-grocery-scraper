// Runs the actual entry point with in-memory Actor storage/billing and synthetic HTTP.
// Nothing in this fixture can send a source request or contact Apify.
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { Actor, Configuration, log } from 'apify';
const require = createRequire(import.meta.url);
const { ChargingManager, pushDataAndCharge } = require(path.join(path.dirname(require.resolve('apify/package.json')), 'dist/charging.js'));
const scenario = process.argv[2];
registerHooks({
    resolve(specifier, context, next) {
        if (specifier === 'got-scraping' && context.parentURL?.endsWith('/dist/bigbasket.js')) {
            return { url: 'fixture:bigbasket-http', shortCircuit: true };
        }
        return next(specifier, context);
    },
    load(url, context, next) {
        if (url === 'fixture:bigbasket-http') return {
            format: 'module', shortCircuit: true,
            source: 'export const gotScraping = options => globalThis.__bigbasketFixtureRequest(options);',
        };
        return next(url, context);
    },
});
const { productsFromListingData, sourceFromKeyword } = await import('../../dist/bigbasket.js');
const { trackProduct, trackingKey } = await import('../../dist/tracking.js');
const listingRequests = [], artifacts = new Map(), snapshots = new Map();
let savedCount = 0, chargedCount = 0, duplicateSaves = 0, snapshotWrites = 0, snapshotReads = 0, initializedProxy = false;
let landingRequests = 0, headerRequests = 0, recoverableFailure = false, error = null, exited = false;
const ids = new Set();
const context = { sourcePincode: '560004', sourceCity: 'Bangalore', sourceCityId: 1,
    sourceAddressIsPartial: true, serviceAreaIds: [19224] };
const contextKey = JSON.stringify(['fixture', '560004', 1, 19224, 1820]);
const input = { keywords: ['milk'], maxResults: 1000, maxPagesPerSource: 25,
    inStockOnly: true, trackChanges: true, historyLimit: 90, includeHistory: true,
    trackingRegion: 'fixture', proxyConfiguration: { useApifyProxy: false } };
if (scenario === 'small-catalog') { input.maxResults = 1; input.maxPagesPerSource = 1; input.trackChanges = false; }
if (scenario === 'guard-mismatch') input.expectedPincode = '400001';
if (scenario === 'overlapping-sources') { input.keywords = ['milk', 'rice']; input.maxResults = 120; input.maxPagesPerSource = 2; }
if (scenario === 'filtered-pages') { input.brands = ['Fixture brand']; input.maxResults = 40; }
const cap = scenario === 'spending-cap' ? 41 : scenario === 'empty-budget' ? 0 : Infinity;
const charging = new ChargingManager(new Configuration({
    isAtHome: true, actorRunId: 'synthetic-fixture-run', useChargingLogDataset: false,
    actorPricingInfo: JSON.stringify({ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: {
        'product-scraped': { eventPriceUsd: 0.002, eventTitle: 'Product' },
        'apify-actor-start': { eventPriceUsd: 0.00005, eventTitle: 'Start' },
    } } }),
    chargedEventCounts: JSON.stringify({ 'apify-actor-start': 1 }),
    maxTotalChargeUsd: cap === Infinity ? Infinity : 0.00005 + cap * 0.002,
}), { run: () => ({ charge: async ({ count }) => { if (count !== 1) throw new Error('Unexpected fixture charge count'); } }) });
await charging.init();
const rawProduct = id => ({ id: String(id), desc: 'Synthetic milk', w: '500 ml', absolute_url: `/pd/${id}/fixture/`,
    pricing: { discount: { mrp: '40', prim_price: { sp: '32' } } },
    visibility: { sa_id: 19224, fc_id: 1820 }, availability: { avail_status: '001', not_for_sale: false } });
const payload = products => ({ tabs: [{ product_info: { number_of_pages: 25, products } }] });
const header = { selected_address_id: 'fixture', addresses: [{ id: 'fixture', pin: '560004', city_name: 'Bangalore', city_id: 1, is_partial: true }],
    sa_list: [{ sa_id: 19224 }] };
const history = Array.from({ length: 89 }, (_, index) => ({ observedAt: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
    price: 32, inStock: true, packSize: '500 ml' }));
for (let id = 1; id <= 1000; id += 1) {
    const row = productsFromListingData(payload([rawProduct(id)]), sourceFromKeyword('milk'), 1, context)[0];
    const snapshot = trackProduct({ ...row, scrapedAt: history.at(-1).observedAt }, null, { contextKey }).snapshot;
    snapshots.set(trackingKey(row, contextKey), { ...snapshot, history });
}
globalThis.__bigbasketFixtureRequest = async options => {
    const url = new URL(options.url);
    if (url.hostname !== 'www.bigbasket.com') throw new Error('Unexpected fixture host');
    if (url.pathname === '/ps/') {
        landingRequests += 1;
        if (scenario === 'all-sources-failed') return { statusCode: 503, body: '', headers: {} };
        return { statusCode: 200, body: '<html>synthetic fixture</html>', headers: { 'set-cookie': ['fixture=anonymous; Path=/'] } };
    }
    if (url.pathname === '/ui-svc/v2/header/') {
        headerRequests += 1;
        return { statusCode: 200, body: JSON.stringify(header), headers: {} };
    }
    if (url.pathname !== '/listing-svc/v2/products/') throw new Error('Unexpected fixture route');
    const page = Number(url.searchParams.get('page'));
    listingRequests.push(page);
    if (scenario === 'later-source-failure' && page === 3) return { statusCode: 503, body: '', headers: {} };
    if (scenario === 'recoverable-429' && page === 12 && !recoverableFailure) {
        recoverableFailure = true;
        return { statusCode: 429, body: '', headers: {} };
    }
    let products = Array.from({ length: 40 }, (_, index) => rawProduct((page - 1) * 40 + index + 1));
    if (scenario === 'overlapping-sources' && url.searchParams.get('slug') === 'rice' && page === 2) {
        products = Array.from({ length: 40 }, (_, index) => rawProduct(index + 81));
    }
    if (page > 1) products.unshift(rawProduct(1), rawProduct(2));
    if (scenario === 'duplicate-page') products = Array.from({ length: 40 }, (_, index) => rawProduct(index + 1));
    if (scenario === 'empty-later-page' && page >= 3) products = [];
    if (scenario === 'malformed-row' && page === 12) products.splice(15, 0, null, rawProduct('invalid'));
    if (scenario === 'malformed-row' && page === 12) products[16].absolute_url = 'https://[';
    if (scenario === 'filtered-pages' && page >= 3) for (const product of products) product.brand = { name: 'Fixture brand' };
    return { statusCode: 200, body: JSON.stringify(payload(products)), headers: {} };
};
Actor.init = async () => {};
Actor.getInput = async () => input;
Actor.createProxyConfiguration = async () => { initializedProxy = true; return undefined; };
Actor.getChargingManager = () => charging;
Actor.openKeyValueStore = async () => ({ id: 'fixture-history',
    getValue: async key => { snapshotReads += 1; return snapshots.get(key) ?? null; },
    setValue: async (key, value) => { snapshotWrites += 1; snapshots.set(key, value); },
});
Actor.pushData = async (row, event) => {
    if (event !== 'product-scraped') throw new Error('Unexpected fixture charge event');
    if (scenario === 'delivery-failure' && savedCount === 80) throw new Error('Synthetic dataset delivery failure');
    const result = await pushDataAndCharge({ chargingManager: charging, items: row, eventName: event,
        isDefaultDataset: true, pushFn: async rows => {
            for (const item of Array.isArray(rows) ? rows : [rows]) {
                if (ids.has(item.productId)) duplicateSaves += 1;
                ids.add(item.productId); savedCount += 1;
                if (input.trackChanges && (item.historyCount !== 90 || item.priceHistory.length !== 90)) throw new Error('History was not bounded at 90');
            }
        },
    });
    chargedCount = charging.getChargedEventCount('product-scraped');
    return result;
};
Actor.setValue = async (key, value) => { artifacts.set(key, structuredClone(value)); };
Actor.setStatusMessage = async () => {};
Actor.exit = async () => { exited = true; };
log.info = () => {};
log.warning = () => {};
// Avoid real pacing sleeps in a network-free fixture.
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, _delay, ...args) => originalTimeout(callback, 0, ...args);
try { await import('../../dist/main.js'); } catch (caught) { error = caught.message; }
const report = { scenario, savedCount, chargedCount, duplicateSaves, snapshotWrites, snapshotReads,
    listingRequests, landingRequests, headerRequests, initializedProxy, error, exited,
    summary: artifacts.get('MONITORING-SUMMARY'), alertCount: artifacts.get('ALERTS')?.length,
    maxHistory: Math.max(...[...snapshots.values()].map(snapshot => snapshot.history.length)),
    peakProcessMiB: process.resourceUsage().maxRSS / 1024 };
console.log('FIXTURE_RESULT:' + JSON.stringify(report));
