import assert from 'node:assert/strict';
import test from 'node:test';

import { packFacts } from '../dist/catalog.js';
import { normalizeInput } from '../dist/input.js';
import { monitoringArtifacts } from '../dist/monitoring.js';
import { parseProductSnapshot, trackProduct, trackingKey } from '../dist/tracking.js';

const start = '2026-08-23T10:00:00.000Z';
const later = '2026-08-24T10:00:00.000Z';
const context = 'test-store:560004:1:19224:1820';

function product(overrides = {}) {
    return {
        source: 'bigbasket', searchQuery: 'milk', position: 1, productId: 'milk-1',
        title: 'Example Milk', brand: 'Example', price: 100, mrp: 120, discountPercent: 17,
        currency: 'INR', packSize: '500 ml', ...packFacts('500 ml', 100), category: 'Milk',
        rating: null, ratingCount: null, inStock: true, productUrl: 'https://www.bigbasket.com/pd/1/example/',
        imageUrl: null, scrapedAt: start, sourcePincode: '560004', sourceCity: 'Bangalore',
        sourceCityId: 1, sourceAddressIsPartial: true, sourceServiceAreaId: 19224,
        sourceFulfillmentCenterId: 1820, locationContextStatus: 'source_assigned', deliveryLocationVerified: false,
        ...overrides,
    };
}

test('normalizes explicit mass, volume, piece, and multipack labels', () => {
    const cases = [
        ['1 kg', 80, 1, 1000, 'g', '100 g', 8],
        ['500 gms', 20, 1, 500, 'g', '100 g', 4],
        ['.25 litres', 20, 1, 250, 'ml', '1 L', 80],
        ['2 x 500 ml', 80, 2, 1000, 'ml', '1 L', 80],
        ['500 ml - Pack of 2', 80, 2, 1000, 'ml', '1 L', 80],
        ['Pack of 2 × 250 grams', 60, 2, 500, 'g', '100 g', 12],
        ['6 pcs', 30, 1, 6, 'piece', '1 piece', 5],
        ['2 x 3 pieces', 30, 2, 6, 'piece', '1 piece', 5],
    ];
    for (const [label, price, count, quantity, unit, basis, unitPrice] of cases) {
        const facts = packFacts(label, price);
        assert.equal(facts.packNormalizationStatus, 'parsed', label);
        assert.equal(facts.packCount, count, label);
        assert.equal(facts.totalQuantity, quantity, label);
        assert.equal(facts.quantityUnit, unit, label);
        assert.equal(facts.unitPriceBasis, basis, label);
        assert.equal(facts.unitPrice, unitPrice, label);
    }
    assert.equal(packFacts('0.5 kg', 40).packIdentity, packFacts('500 g', 40).packIdentity);
    assert.equal(packFacts('2 x 500 ml', 80).packIdentity, packFacts('500 ml - Pack of 2', 80).packIdentity);
    assert.notEqual(packFacts('2 x 500 ml', 80).packIdentity, packFacts('1 L', 80).packIdentity);
});

test('does not guess quantities from ambiguous or unsafe pack labels', () => {
    for (const label of ['N/A', 'Family Pack', '500 ml - Pouch', '1 kg (Approx. 6 - 8 pcs)', '64/L', '0 g', '0 x 500 g', '101 x 1 g', '1.5 pcs', '1001 kg']) {
        const facts = packFacts(label, 20);
        assert.equal(facts.packNormalizationStatus, 'unrecognized', label);
        assert.equal(facts.packIdentity, null, label);
        assert.equal(facts.totalQuantity, null, label);
        assert.equal(facts.unitPrice, null, label);
    }
    assert.equal(packFacts('500 ml', null).unitPrice, null);
    assert.equal(packFacts('500 ml', -1).unitPrice, null);
    assert.equal(packFacts('500 ml', 0).unitPrice, 0);
});

test('validates monitoring bounds and a stable lowercase context label', () => {
    const input = normalizeInput({ historyLimit: 90, includeHistory: true, trackingRegion: 'Milk_Watch-1', expectedPincode: '560004', priceChangeThresholdPercent: 12.5, priceChangeThresholdAbsolute: 2.5, alertOnStockChanges: false });
    assert.equal(input.historyLimit, 90);
    assert.equal(input.includeHistory, true);
    assert.equal(input.trackingRegion, 'milk_watch-1');
    assert.equal(input.expectedPincode, '560004');
    assert.equal(input.priceChangeThresholdPercent, 12.5);
    assert.equal(input.priceChangeThresholdAbsolute, 2.5);
    assert.equal(input.alertOnStockChanges, false);
    for (const [field, value] of [
        ['historyLimit', 0], ['historyLimit', 91], ['historyLimit', 1.5],
        ['priceChangeThresholdPercent', -1], ['priceChangeThresholdPercent', 1001], ['priceChangeThresholdPercent', Infinity],
        ['priceChangeThresholdAbsolute', -1], ['priceChangeThresholdAbsolute', 1000001], ['priceChangeThresholdAbsolute', NaN],
        ['trackingRegion', 'spaces are invalid'], ['trackingRegion', 'x'.repeat(64)],
        ['expectedPincode', '56000'], ['expectedPincode', '056004'], ['expectedPincode', 'abcdef'], ['expectedPincode', 560004],
    ]) assert.throws(() => normalizeInput({ [field]: value }), new RegExp(field));
});

test('reports simultaneous price and stock changes without losing either event', () => {
    const first = trackProduct(product(), null, { contextKey: context });
    const next = trackProduct(product({ price: 80, inStock: false, scrapedAt: later }), first.snapshot, { contextKey: context });
    assert.deepEqual(next.record.changeTypes, ['price_drop', 'out_of_stock']);
    assert.deepEqual(next.record.alertReasons, ['price_drop', 'out_of_stock']);
    assert.equal(next.record.changeType, 'price_drop');
    assert.equal(next.record.previousPrice, 100);
    assert.equal(next.record.priceChangePercent, -20);
    assert.equal(next.record.alertTriggered, true);
    assert.equal(first.record.alertTriggered, false);
});

test('requires both price thresholds while stock alerts remain independently configurable', () => {
    const first = trackProduct(product(), null, { contextKey: context });
    const options = { contextKey: context, priceChangeThresholdAbsolute: 10, priceChangeThresholdPercent: 20 };
    const below = trackProduct(product({ price: 85, scrapedAt: later }), first.snapshot, options);
    assert.equal(below.record.changeDetected, true);
    assert.equal(below.record.alertTriggered, false);
    const atThreshold = trackProduct(product({ price: 80, scrapedAt: later }), first.snapshot, options);
    assert.equal(atThreshold.record.alertTriggered, true);
    const absoluteBlocked = trackProduct(product({ price: 80, scrapedAt: later }), first.snapshot, { ...options, priceChangeThresholdAbsolute: 21 });
    assert.equal(absoluteBlocked.record.alertTriggered, false);
    const stock = trackProduct(product({ price: 99, inStock: false, scrapedAt: later }), first.snapshot, options);
    assert.deepEqual(stock.record.alertReasons, ['out_of_stock']);
    const disabled = trackProduct(product({ price: 99, inStock: false, scrapedAt: later }), first.snapshot, { ...options, alertOnStockChanges: false });
    assert.equal(disabled.record.stockChanged, true);
    assert.equal(disabled.record.alertTriggered, false);
    const zeroBaseline = trackProduct(product({ price: 0 }), null, { contextKey: context });
    const unavailablePercent = trackProduct(product({ price: 10, scrapedAt: later }), zeroBaseline.snapshot, options);
    assert.equal(unavailablePercent.record.priceChangePercent, null);
    assert.equal(unavailablePercent.record.alertTriggered, false);
});

test('retains only the latest observations and makes row history optional', () => {
    let previous = null;
    let last;
    for (let day = 1; day <= 5; day += 1) {
        last = trackProduct(product({ price: day, scrapedAt: `2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z` }), previous, { contextKey: context, historyLimit: 3, includeHistory: true });
        previous = last.snapshot;
    }
    assert.equal(last.record.historyCount, 3);
    assert.deepEqual(last.record.priceHistory.map(item => item.price), [3, 4, 5]);
    assert.deepEqual(last.snapshot.history.map(item => item.price), [3, 4, 5]);
    const hidden = trackProduct(product({ price: 6, scrapedAt: later }), previous, { contextKey: context, historyLimit: 3 });
    assert.equal(Object.hasOwn(hidden.record, 'priceHistory'), false);
    assert.equal(hidden.record.historyCount, 3);
    assert.deepEqual(hidden.snapshot.history.map(item => item.price), [4, 5, 6]);
    const capped = trackProduct(product(), null, { contextKey: context });
    assert.equal(capped.snapshot.history.length, 1);
});

test('pack and source changes reset the baseline without alerts or mixed history', () => {
    const first = trackProduct(product(), null, { contextKey: context });
    const changedPack = { ...product({ packSize: '1 L', price: 160, scrapedAt: later }), ...packFacts('1 L', 160) };
    const reset = trackProduct(changedPack, first.snapshot, { contextKey: context, includeHistory: true });
    assert.equal(reset.record.changeType, 'baseline_reset');
    assert.equal(reset.record.comparisonSkippedReason, 'pack_size_changed');
    assert.equal(reset.record.previousPrice, null);
    assert.equal(reset.record.alertTriggered, false);
    assert.equal(reset.record.priceHistory.length, 1);
    const moved = trackProduct(product({ price: 1, scrapedAt: later }), first.snapshot, { contextKey: 'other-source' });
    assert.equal(moved.record.comparisonSkippedReason, 'delivery_context_changed_or_legacy');
    assert.equal(moved.record.alertTriggered, false);
    const legacy = { ...first.snapshot, contextKey: undefined };
    assert.equal(trackProduct(product({ scrapedAt: later }), legacy, { contextKey: context }).record.changeType, 'baseline_reset');
    const unknownFirst = trackProduct(product({ packSize: 'small pouch', ...packFacts('small pouch', 100) }), null, { contextKey: context });
    const unknownNext = trackProduct(product({ packSize: 'large pouch', ...packFacts('large pouch', 100), scrapedAt: later }), unknownFirst.snapshot, { contextKey: context });
    assert.equal(unknownNext.record.comparisonSkippedReason, 'unrecognized_pack_size_changed');
    assert.equal(unknownNext.record.alertTriggered, false);
});

test('missing source linkage suppresses price and stock comparisons', () => {
    const first = trackProduct(product(), null, { contextKey: context });
    const next = trackProduct(product({ price: 1, inStock: false, scrapedAt: later }), first.snapshot, { contextKey: context, contextAvailable: false, trackingRegion: 'example' });
    assert.equal(next.record.comparisonSkippedReason, 'source_context_unavailable');
    assert.equal(next.record.changeDetected, false);
    assert.equal(next.record.alertTriggered, false);
    assert.equal(next.record.previousPrice, null);
    assert.equal(next.record.previousInStock, null);
    assert.equal(next.record.trackingRegion, 'example');
});

test('unknown stock observations do not create false stock alerts', () => {
    const first = trackProduct(product(), null, { contextKey: context });
    const unknown = trackProduct(product({ inStock: null, scrapedAt: later }), first.snapshot, { contextKey: context });
    assert.equal(unknown.record.stockChanged, false);
    assert.equal(unknown.record.alertTriggered, false);
    const unavailable = trackProduct(product({ inStock: false, scrapedAt: '2026-08-25T10:00:00.000Z' }), unknown.snapshot, { contextKey: context });
    assert.equal(unavailable.record.previousInStock, null);
    assert.equal(unavailable.record.stockChanged, false);
    assert.equal(unavailable.record.alertTriggered, false);
});

test('older or equal observations cannot overwrite newer snapshots or trigger alerts', () => {
    const first = trackProduct(product({ scrapedAt: later }), null, { contextKey: context });
    for (const timestamp of [start, later]) {
        const stale = trackProduct(product({ price: 1, inStock: false, scrapedAt: timestamp }), first.snapshot, { contextKey: context, includeHistory: true });
        assert.equal(stale.record.comparisonSkippedReason, 'observation_not_newer');
        assert.equal(stale.record.changeDetected, false);
        assert.equal(stale.record.alertTriggered, false);
        assert.deepEqual(stale.snapshot, first.snapshot);
        assert.deepEqual(stale.record.priceHistory, first.snapshot.history);
    }
});

test('scoped keys isolate products and source contexts without using legacy product-only keys', () => {
    const row = product();
    const key = trackingKey(row, context);
    assert.match(key, /^PRODUCT_V2_[a-f0-9]{64}$/);
    assert.equal(key, trackingKey(row, context));
    assert.notEqual(key, trackingKey(row, 'other-source'));
    assert.notEqual(key, trackingKey(product({ productId: 'milk-2' }), context));
    assert.notEqual(key, trackingKey(row));
});

test('snapshot parsing excludes invalid observations and bounds imported history', () => {
    const base = trackProduct(product(), null, { contextKey: context }).snapshot;
    const history = Array.from({ length: 100 }, (_, index) => ({ observedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), price: index, inStock: true, packSize: '500 ml', extraFixtureField: 'must-not-retain' })).reverse();
    const parsed = parseProductSnapshot({ ...base, history: [...history, { observedAt: 'invalid', price: 2, inStock: true, packSize: '500 ml' }] });
    assert.equal(parsed.history.length, 90);
    assert.equal(parsed.history[0].price, 10);
    assert.equal(parsed.history.at(-1).price, 99);
    assert.equal(JSON.stringify(parsed).includes('must-not-retain'), false);
    for (const observation of parsed.history) assert.deepEqual(Object.keys(observation).sort(), ['inStock', 'observedAt', 'packSize', 'price']);
    assert.equal(parseProductSnapshot({ ...base, price: -1 }), null);
    assert.equal(parseProductSnapshot({ ...base, lastSeenAt: 'not-a-date' }), null);
});

test('monitoring artifacts count saved observations and remove history from alert copies', () => {
    const baseline = trackProduct(product(), null, { contextKey: context, includeHistory: true });
    const changed = trackProduct(product({ price: 80, inStock: false, scrapedAt: later }), baseline.snapshot, { contextKey: context, includeHistory: true });
    const reset = trackProduct(product({ scrapedAt: later }), baseline.snapshot, { contextKey: 'other-context' });
    const details = { savedCount: 3, trackingEnabled: true, trackingStoreId: 'fixture-store', collectionStatus: 'budget_limited', successfulPageCount: 1, trackingPersistenceFailures: 1, expectedPincode: '560004' };
    const output = monitoringArtifacts([baseline.record, changed.record, reset.record], details);
    assert.equal(output.summary.savedCount, 3);
    assert.equal(output.summary.trackedCount, 3);
    assert.equal(output.summary.initializedCount, 1);
    assert.equal(output.summary.baselineResetCount, 1);
    assert.equal(output.summary.changedCount, 1);
    assert.equal(output.summary.alertCount, 1);
    assert.equal(output.summary.priceDropCount, 1);
    assert.equal(output.summary.stockChangeCount, 1);
    assert.equal(output.summary.collectionStatus, 'budget_limited');
    assert.equal(output.summary.trackingPersistenceFailures, 1);
    assert.equal(output.summary.locationSelectionSupported, false);
    assert.equal(output.summary.deliveryLocationVerified, false);
    assert.equal(output.alerts.length, 1);
    assert.equal(Object.hasOwn(output.alerts[0], 'priceHistory'), false);
    assert.equal(changed.record.priceHistory.length, 2);
    const empty = monitoringArtifacts([], { ...details, savedCount: 0, collectionStatus: 'partial' });
    assert.equal(empty.summary.stockChangeCount, 0);
    assert.equal(empty.summary.alertCount, 0);
    assert.deepEqual(empty.alerts, []);
});
