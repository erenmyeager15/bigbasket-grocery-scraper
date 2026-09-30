import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchProductPage, productsFromListingData, sourceFromKeyword } from '../dist/bigbasket.js';
import { assertExpectedPincode, bindProductContext, sourceContextFromHeader, LocationContextError } from '../dist/location.js';

const headerPayload = {
    selected_address_id: 'selected-test-context',
    addresses: [
        { id: 'other-context', pin: 400001, city_id: 2, city_name: 'Other City' },
        { id: 'selected-test-context', pin: 560004, city_id: 1, city_name: ' Bangalore ', is_partial: true, lat: 0, lng: 0, address1: 'PRIVATE FIXTURE', contact_no: 'PRIVATE FIXTURE', first_name: 'PRIVATE FIXTURE' },
    ],
    sa_list: [
        { sa_id: 19224, entry_context_ids: [10] },
        { sa_id: '19226', entry_context_ids: [100] },
    ],
    default_door_ec: 100,
};

const listingPayload = {
    tabs: [{ product_info: { number_of_pages: 2, products: [{
        id: 'fixture-milk', desc: 'Milk', w: '500 ml', absolute_url: '/pd/1/milk/',
        brand: { name: 'Example' }, visibility: { sa_id: 19224, fc_id: 1820 },
        availability: { avail_status: '001', not_for_sale: false },
        pricing: { discount: { mrp: '40', prim_price: { sp: '32', base_price: '64', base_unit: 'L' } } },
    }] } }],
};

function clientFor(header = headerPayload, listing = listingPayload, headerStatus = 200) {
    const calls = [];
    const request = async options => {
        const url = new URL(options.url);
        calls.push({ path: url.pathname, cookie: options.headers.cookie, proxyUrl: options.proxyUrl });
        if (url.pathname === '/ps/') return { statusCode: 200, body: '<html></html>', headers: { 'set-cookie': ['fixture_anon=first; Path=/'] } };
        if (url.pathname === '/ui-svc/v2/header/') return { statusCode: headerStatus, body: JSON.stringify(header), headers: { 'set-cookie': ['fixture_anon=updated; Path=/'] } };
        if (url.pathname === '/listing-svc/v2/products/') return { statusCode: 200, body: JSON.stringify(listing), headers: { 'set-cookie': ['fixture_anon=listing-rotated; Path=/'] } };
        throw new Error(`Unexpected fixture request: ${url.pathname}`);
    };
    return { calls, request };
}

test('retains only matched source metadata and discards address/private fixture fields', () => {
    const context = sourceContextFromHeader(headerPayload);
    assert.deepEqual(context, {
        sourcePincode: '560004', sourceCity: 'Bangalore', sourceCityId: 1,
        sourceAddressIsPartial: true, serviceAreaIds: [19224, 19226],
    });
    const serialized = JSON.stringify(context);
    assert.equal(serialized.includes('PRIVATE FIXTURE'), false);
    assert.equal(serialized.includes('selected-test-context'), false);
    for (const name of ['lat', 'lng', 'address1', 'contact_no', 'first_name', 'selected_address_id']) assert.equal(Object.hasOwn(context, name), false);
});

test('rejects absent, ambiguous, or malformed selected source context', () => {
    assert.equal(sourceContextFromHeader(null), null);
    assert.equal(sourceContextFromHeader({ ...headerPayload, selected_address_id: 'missing' }), null);
    assert.equal(sourceContextFromHeader({ ...headerPayload, addresses: [headerPayload.addresses[1], headerPayload.addresses[1]] }), null);
    assert.equal(sourceContextFromHeader({ ...headerPayload, addresses: [{ ...headerPayload.addresses[1], pin: 'invalid' }] }), null);
    assert.equal(sourceContextFromHeader({ ...headerPayload, addresses: [] }), null);
});

test('expected-pincode guard uses source metadata without claiming delivery verification', () => {
    const context = sourceContextFromHeader(headerPayload);
    assert.doesNotThrow(() => assertExpectedPincode('560004', context));
    assert.doesNotThrow(() => assertExpectedPincode(undefined, null));
    assert.throws(() => assertExpectedPincode('400001', context), LocationContextError);
    assert.throws(() => assertExpectedPincode('560004', null), /does not select a delivery location/);
    const row = bindProductContext({ sa_id: 19224, fc_id: 1820 }, context);
    assert.equal(row.sourcePincode, '560004');
    assert.equal(row.deliveryLocationVerified, false);
    assert.equal(row.sourceAddressIsPartial, true);
});

test('binds the product actual service area, including integrated services outside EC100', () => {
    const context = sourceContextFromHeader(headerPayload);
    const rows = productsFromListingData(listingPayload, sourceFromKeyword('milk'), 1, context);
    assert.equal(rows[0].sourceServiceAreaId, 19224);
    assert.equal(rows[0].sourceFulfillmentCenterId, 1820);
    assert.equal(rows[0].sourcePincode, '560004');
    assert.equal(rows[0].locationContextStatus, 'source_assigned');
    assert.equal(rows[0].deliveryLocationVerified, false);
    for (const visibility of [{ sa_id: 999, fc_id: 1820 }, { sa_id: 19224 }, { fc_id: 1820 }]) {
        const unlinked = bindProductContext(visibility, context);
        assert.equal(unlinked.locationContextStatus, 'product_context_only');
        assert.equal(unlinked.sourcePincode, null);
        assert.equal(unlinked.sourceCity, null);
        assert.equal(unlinked.deliveryLocationVerified, false);
    }
    const absent = bindProductContext({ sa_id: -1, fc_id: 'invalid' }, context);
    assert.equal(absent.locationContextStatus, 'unavailable');
    assert.equal(absent.sourceServiceAreaId, null);
    assert.equal(absent.sourceFulfillmentCenterId, null);
});

test('missing package quantity is never inferred from the displayed base price', () => {
    const fixture = structuredClone(listingPayload);
    delete fixture.tabs[0].product_info.products[0].w;
    const row = productsFromListingData(fixture, sourceFromKeyword('milk'), 1)[0];
    assert.equal(row.packSize, 'N/A');
    assert.equal(row.packNormalizationStatus, 'unrecognized');
    assert.equal(row.unitPrice, null);
});

test('unknown stock remains null and unavailable stock requires an explicit source signal', () => {
    for (const [availability, expected] of [
        [undefined, null], [{}, null], [{ avail_status: 'unknown' }, null],
        [{ avail_status: '000', not_for_sale: false }, null],
        [{ avail_status: '001', not_for_sale: false }, true],
        [{ avail_status: '001', not_for_sale: true }, false],
        [{ not_for_sale: true }, false],
    ]) {
        const fixture = structuredClone(listingPayload);
        fixture.tabs[0].product_info.products[0].availability = availability;
        const row = productsFromListingData(fixture, sourceFromKeyword('milk'), 1)[0];
        assert.equal(row.inStock, expected, JSON.stringify(availability));
    }
});

test('reuses one anonymous session and source header across pages with the same proxy', async () => {
    const client = clientFor();
    const source = sourceFromKeyword('milk');
    const first = await fetchProductPage(source, 1, 'http://fixture-proxy:8000', { request: client.request, expectedPincode: '560004' });
    const second = await fetchProductPage(source, 2, 'http://fixture-proxy:8000', { request: client.request, expectedPincode: '560004', session: first.session });
    assert.deepEqual(client.calls.map(call => call.path), ['/ps/', '/ui-svc/v2/header/', '/listing-svc/v2/products/', '/listing-svc/v2/products/']);
    assert.equal(client.calls[1].cookie, 'fixture_anon=first');
    assert.equal(client.calls[2].cookie, 'fixture_anon=updated');
    assert.equal(client.calls[3].cookie, 'fixture_anon=listing-rotated');
    assert.equal(first.products[0].locationContextStatus, 'source_assigned');
    assert.equal(first.numberOfPages, 2);
    assert.equal(second.session, first.session);
    await assert.rejects(fetchProductPage(source, 3, 'http://other-proxy:8000', { request: client.request, session: first.session }), /different proxy/);
    assert.equal(client.calls.length, 4);
});

test('mismatched or unavailable expected context stops before any listing request', async () => {
    for (const [header, status] of [[headerPayload, 200], [null, 200], [headerPayload, 403]]) {
        const client = clientFor(header, listingPayload, status);
        await assert.rejects(fetchProductPage(sourceFromKeyword('milk'), 1, undefined, { request: client.request, expectedPincode: '400001' }), LocationContextError);
        assert.deepEqual(client.calls.map(call => call.path), ['/ps/', '/ui-svc/v2/header/']);
    }
});

test('an expected-pincode match cannot pass when listing product context is unlinked', async () => {
    const listing = structuredClone(listingPayload);
    listing.tabs[0].product_info.products[0].visibility.sa_id = 999;
    const client = clientFor(headerPayload, listing);
    await assert.rejects(fetchProductPage(sourceFromKeyword('milk'), 1, undefined, { request: client.request, expectedPincode: '560004' }), /could not be linked/);
    assert.equal(client.calls.at(-1).path, '/listing-svc/v2/products/');
});

test('catalog collection without a guard reports only available product context when the header fails', async () => {
    const client = clientFor(headerPayload, listingPayload, 403);
    const result = await fetchProductPage(sourceFromKeyword('milk'), 1, undefined, { request: client.request });
    assert.equal(result.products[0].locationContextStatus, 'product_context_only');
    assert.equal(result.products[0].sourcePincode, null);
    assert.equal(result.products[0].deliveryLocationVerified, false);
    assert.equal(result.session.locationContext, null);
});
