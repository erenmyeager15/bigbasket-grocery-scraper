import assert from 'node:assert/strict';
import test from 'node:test';
import { productsFromListingData, fetchProductPage, sourceFromKeyword } from '../dist/bigbasket.js';

const source = sourceFromKeyword('milk');
const product = (id, overrides = {}) => ({
    id: String(id), desc: 'Fixture product', w: '500 ml', absolute_url: `/pd/${id}/fixture/`,
    pricing: { discount: { mrp: '40', prim_price: { sp: '32' } } },
    availability: { avail_status: '001', not_for_sale: false }, ...overrides,
});
const payload = products => ({ tabs: [{ product_info: { number_of_pages: 25, products } }] });

test('one malformed product does not discard the valid rows in a large listing page', () => {
    const raw = Array.from({ length: 40 }, (_, index) => product(index + 1));
    raw.splice(15, 0, null, [], 'invalid', product('broken', { absolute_url: 'https://[' }));
    const rows = productsFromListingData(payload(raw), source, 12);
    assert.equal(rows.length, 40);
    assert.equal(new Set(rows.map(row => row.productId)).size, 40);
});

test('invalid numeric prices and off-source product links are not saved', () => {
    const prices = ['-1', '12abc', 'Infinity', '', null, '0', '12.50'];
    const raw = prices.map((price, index) => product(index + 1, {
        pricing: { discount: { prim_price: { sp: price } } },
    }));
    raw.push(product(8, { absolute_url: 'https://other.invalid/pd/8/item/' }));
    raw.push(product(9, { absolute_url: 'javascript:alert(1)' }));
    const rows = productsFromListingData(payload(raw), source, 1);
    assert.deepEqual(rows.map(row => row.productId), ['6', '7']);
    assert.deepEqual(rows.map(row => row.price), [0, 12.5]);
});

test('a missing listing envelope is an error rather than a successful empty catalog', async () => {
    for (const body of [null, {}, { tabs: [] }, { tabs: [{ product_info: {} }] }, { tabs: [{ product_info: { products: null } }] }]) {
        await assert.rejects(fetchProductPage(source, 3, undefined, {
            session: { cookie: '', locationContext: null },
            request: async () => ({ statusCode: 200, body: JSON.stringify(body), headers: {} }),
        }), /listing.*(?:format|structure|products)/i);
    }
});

test('an explicit empty products array remains a valid no-results response', async () => {
    const result = await fetchProductPage(source, 3, undefined, {
        session: { cookie: '', locationContext: null },
        request: async () => ({ statusCode: 200, body: JSON.stringify(payload([])), headers: {} }),
    });
    assert.deepEqual(result.products, []);
});

test('a page containing only invalid product cards is reported as an error', async () => {
    await assert.rejects(fetchProductPage(source, 1, undefined, {
        session: { cookie: '', locationContext: null },
        request: async () => ({ statusCode: 200, body: JSON.stringify(payload([null, product(1, {
            pricing: { discount: { prim_price: { sp: '-2' } } },
        })])), headers: {} }),
    }), /none had valid product/);
});
