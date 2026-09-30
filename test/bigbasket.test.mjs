import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildListingEndpoint,
    productsFromListingData,
    sourceFromCategoryUrl,
    sourceFromKeyword,
} from '../dist/bigbasket.js';
import { normalizeInput } from '../dist/input.js';
import { parseProductSnapshot, trackProduct, trackingKey } from '../dist/tracking.js';

const listingPayload = {
    tabs: [
        {
            product_info: {
                number_of_pages: 3,
                products: [
                    {
                        id: '40147597',
                        desc: 'Daily Health Toned Milk',
                        absolute_url: '/pd/40147597/heritage-daily-health-toned-milk-500-ml-pouch/',
                        brand: { name: 'Heritage' },
                        w: '500 ml',
                        category: { tlc_name: 'Bakery, Cakes & Dairy' },
                        rating_info: {
                            avg_rating: '3.7',
                            rating_count: '18036',
                        },
                        availability: {
                            avail_status: '001',
                            not_for_sale: false,
                        },
                        visibility: { sa_id: 19224, fc_id: 1820 },
                        pricing: {
                            discount: {
                                mrp: '40',
                                prim_price: {
                                    sp: '32',
                                    base_price: '64',
                                    base_unit: 'L',
                                },
                            },
                        },
                        images: [
                            {
                                l: '//www.bbassets.com/media/uploads/p/l/40147597_9-heritage-daily-health-toned-milk.jpg',
                            },
                        ],
                    },
                    {
                        id: 'missing-price',
                        desc: 'Skipped product',
                        absolute_url: '/pd/1/skipped-product/',
                        pricing: { discount: { prim_price: {} } },
                    },
                ],
            },
        },
    ],
};

test('normalizes default input to one low-cost milk run', () => {
    const input = normalizeInput({});

    assert.deepEqual(input.keywords, ['milk']);
    assert.deepEqual(input.categoryUrls, []);
    assert.deepEqual(input.brands, []);
    assert.equal(input.inStockOnly, true);
    assert.equal(input.maxResults, 1);
    assert.equal(input.maxPagesPerSource, 1);
    assert.equal(input.trackChanges, false);
    assert.equal(input.trackingStoreName, 'bigbasket-price-history');
    assert.equal(input.historyLimit, 20);
    assert.equal(input.includeHistory, false);
    assert.equal(input.priceChangeThresholdPercent, 0);
    assert.equal(input.priceChangeThresholdAbsolute, 0);
    assert.equal(input.alertOnStockChanges, true);
    assert.equal(input.trackingRegion, 'unspecified');
    assert.equal(input.proxyConfiguration.useApifyProxy, true);
    assert.deepEqual(input.proxyConfiguration.apifyProxyGroups, ['RESIDENTIAL']);
    assert.equal(input.proxyConfiguration.apifyProxyCountry, 'IN');
});

test('validates optional run-to-run tracking settings', () => {
    const input = normalizeInput({
        keywords: ['milk'],
        trackChanges: true,
        trackingStoreName: 'mumbai-milk-watch',
    });

    assert.equal(input.trackChanges, true);
    assert.equal(input.trackingStoreName, 'mumbai-milk-watch');
    assert.throws(
        () => normalizeInput({ keywords: ['milk'], trackingStoreName: 'bad store name' }),
        /trackingStoreName/,
    );
});

test('allows category-only input and rejects oversized input', () => {
    const input = normalizeInput({
        keywords: [],
        categoryUrls: ['https://www.bigbasket.com/pc/fruits-vegetables/fresh-vegetables/'],
    });

    assert.deepEqual(input.keywords, []);
    assert.equal(input.categoryUrls.length, 1);
    assert.throws(
        () => normalizeInput({ keywords: ['a', 'b', 'c', 'd', 'e', 'f'] }),
        /at most 5/,
    );
    assert.throws(
        () => normalizeInput({ keywords: ['milk'], maxResults: 0 }),
        /between 1 and 1000/,
    );
});

test('builds and validates BigBasket source definitions', () => {
    assert.deepEqual(sourceFromKeyword('milk'), {
        sourceType: 'keyword',
        source: 'milk',
        type: 'ps',
        slug: 'milk',
    });
    assert.deepEqual(sourceFromCategoryUrl('https://www.bigbasket.com/pc/fruits-vegetables/fresh-vegetables/'), {
        sourceType: 'category',
        source: 'https://www.bigbasket.com/pc/fruits-vegetables/fresh-vegetables/',
        type: 'pc',
        slug: 'fresh-vegetables',
    });
    assert.throws(
        () => sourceFromCategoryUrl('https://example.com/pc/fruits-vegetables/'),
        /bigbasket\.com/,
    );
});

test('uses BigBasket canonical listing endpoint with its required trailing slash', () => {
    const endpoint = buildListingEndpoint(sourceFromKeyword('google Pixel 9a'), 2);

    assert.equal(endpoint.pathname, '/listing-svc/v2/products/');
    assert.equal(endpoint.searchParams.get('type'), 'ps');
    assert.equal(endpoint.searchParams.get('slug'), 'google Pixel 9a');
    assert.equal(endpoint.searchParams.get('page'), '2');
});

test('parses listing payload into clean product records', () => {
    const source = sourceFromKeyword('milk');
    const products = productsFromListingData(listingPayload, source, 2);

    assert.equal(products.length, 1);
    assert.equal(products[0].source, 'bigbasket');
    assert.equal(products[0].searchQuery, 'milk');
    assert.equal(products[0].position, 3);
    assert.equal(products[0].productId, '40147597');
    assert.equal(products[0].title, 'Daily Health Toned Milk');
    assert.equal(products[0].brand, 'Heritage');
    assert.equal(products[0].price, 32);
    assert.equal(products[0].mrp, 40);
    assert.equal(products[0].discountPercent, 20);
    assert.equal(products[0].currency, 'INR');
    assert.equal(products[0].packSize, '500 ml');
    assert.equal(products[0].normalizedPackSize, '1 x 500 ml');
    assert.equal(products[0].totalQuantity, 500);
    assert.equal(products[0].unitPrice, 64);
    assert.equal(products[0].unitPriceBasis, '1 L');
    assert.equal(products[0].sourceServiceAreaId, 19224);
    assert.equal(products[0].sourceFulfillmentCenterId, 1820);
    assert.equal(products[0].locationContextStatus, 'product_context_only');
    assert.equal(products[0].deliveryLocationVerified, false);
    assert.equal(products[0].category, 'Bakery, Cakes & Dairy');
    assert.equal(products[0].rating, 3.7);
    assert.equal(products[0].ratingCount, 18036);
    assert.equal(products[0].inStock, true);
    assert.equal(products[0].productUrl, 'https://www.bigbasket.com/pd/40147597/heritage-daily-health-toned-milk-500-ml-pouch/');
    assert.equal(products[0].imageUrl, 'https://www.bbassets.com/media/uploads/p/l/40147597_9-heritage-daily-health-toned-milk.jpg');
});

test('tracks a new product and a later price drop', () => {
    const product = { ...productsFromListingData(listingPayload, sourceFromKeyword('milk'), 1)[0], scrapedAt: '2026-08-23T10:00:00.000Z' };
    assert.equal(trackingKey(product), 'PRODUCT_40147597');

    const first = trackProduct(product, null);
    assert.equal(first.record.changeType, 'new');
    assert.equal(first.record.changeDetected, false);
    assert.equal(first.record.previousPrice, null);
    assert.equal(first.snapshot.price, 32);

    const changed = trackProduct({
        ...product,
        price: 28,
        inStock: false,
        scrapedAt: '2026-08-24T10:00:00.000Z',
    }, first.snapshot);

    assert.equal(changed.record.changeType, 'price_drop');
    assert.equal(changed.record.changeDetected, true);
    assert.equal(changed.record.previousPrice, 32);
    assert.equal(changed.record.priceChange, -4);
    assert.equal(changed.record.priceChangePercent, -12.5);
    assert.equal(changed.record.previousInStock, true);
    assert.equal(changed.record.stockChanged, true);
    assert.deepEqual(changed.record.changeTypes, ['price_drop', 'out_of_stock']);
    assert.deepEqual(changed.record.alertReasons, ['price_drop', 'out_of_stock']);
    assert.equal(changed.record.previousScrapedAt, product.scrapedAt);
    assert.equal(parseProductSnapshot(changed.snapshot)?.price, 28);
});

test('does not report a price change when both observations have no price', () => {
    const product = {
        ...productsFromListingData(listingPayload, sourceFromKeyword('milk'), 1)[0],
        price: null,
        scrapedAt: '2026-08-23T10:00:00.000Z',
    };
    const first = trackProduct(product, null);
    const second = trackProduct({ ...product, scrapedAt: '2026-08-24T10:00:00.000Z' }, first.snapshot);

    assert.equal(second.record.priceChange, null);
    assert.equal(second.record.changeType, 'unchanged');
    assert.equal(second.record.changeDetected, false);
});
