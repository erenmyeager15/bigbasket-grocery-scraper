import assert from 'node:assert/strict';
import test from 'node:test';

import { productsFromListingData, sourceFromCategoryUrl, sourceFromKeyword } from '../dist/bigbasket.js';
import { normalizeInput } from '../dist/input.js';

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
    assert.equal(input.proxyConfiguration.useApifyProxy, true);
    assert.deepEqual(input.proxyConfiguration.apifyProxyGroups, ['RESIDENTIAL']);
    assert.equal(input.proxyConfiguration.apifyProxyCountry, 'IN');
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
    assert.equal(products[0].category, 'Bakery, Cakes & Dairy');
    assert.equal(products[0].rating, 3.7);
    assert.equal(products[0].ratingCount, 18036);
    assert.equal(products[0].inStock, true);
    assert.equal(products[0].productUrl, 'https://www.bigbasket.com/pd/40147597/heritage-daily-health-toned-milk-500-ml-pouch/');
    assert.equal(products[0].imageUrl, 'https://www.bbassets.com/media/uploads/p/l/40147597_9-heritage-daily-health-toned-milk.jpg');
});
