import assert from 'node:assert/strict';
import test from 'node:test';
import { createStorefrontPageLoader } from '../dist/storefront-retry.js';
import { sourceFromKeyword } from '../dist/bigbasket.js';
import { LocationContextError } from '../dist/location.js';
const milk = sourceFromKeyword('milk');
const session = proxyUrl => ({ proxyUrl, cookie: 'anonymous-fixture=ok', locationContext: null });

test('after a 403 keeps the successful proxy and cookies across pages and sources', async () => {
    const calls = []; const rotations = []; const waits = [];
    const load = createStorefrontPageLoader({
        newProxyUrl: async n => { rotations.push(n); return `http://proxy-${n}.invalid`; },
        wait: async ms => { waits.push(ms); },
        fetchPage: async (source, page, proxy, options) => {
            calls.push({ source: source.source, page, proxy, session: options.session });
            if (proxy === 'http://proxy-1.invalid') throw new Error('HTTP 403');
            return { products: [], numberOfPages: 5, session: options.session ?? session(proxy) };
        },
    });
    const first = await load(milk, 1);
    await load(milk, 2); await load(sourceFromKeyword('rice'), 1);
    assert.deepEqual(rotations, [1, 2]); assert.deepEqual(waits, [1000]);
    assert.deepEqual(calls.map(call => call.proxy), ['http://proxy-1.invalid', ...Array(3).fill('http://proxy-2.invalid')]);
    assert.equal(calls[2].session, first.session); assert.equal(calls[3].session, first.session);
});
test('retires a previously successful session when it later fails', async () => {
    const calls = [];
    const load = createStorefrontPageLoader({
        newProxyUrl: async n => `http://proxy-${n}.invalid`, wait: async () => {},
        fetchPage: async (_source, page, proxy, options) => {
            calls.push({ page, proxy, session: options.session });
            if (page === 2 && proxy === 'http://proxy-1.invalid') throw new Error('HTTP 403');
            return { products: [], numberOfPages: 5, session: options.session ?? session(proxy) };
        },
    });
    await load(milk, 1); await load(milk, 2); await load(milk, 3);
    assert.equal(calls[2].proxy, 'http://proxy-2.invalid'); assert.equal(calls[2].session, undefined);
    assert.equal(calls[3].proxy, 'http://proxy-2.invalid');
});
test('persistent blocks stop at three attempts; next source starts fresh', async () => {
    const rotations = []; const waits = [];
    const load = createStorefrontPageLoader({
        newProxyUrl: async n => { rotations.push(n); return `http://proxy-${n}.invalid`; },
        wait: async ms => { waits.push(ms); }, fetchPage: async () => { throw new Error('HTTP 403'); },
    });
    await assert.rejects(load(milk, 1), /HTTP 403/);
    assert.deepEqual(rotations, [1, 2, 3]); assert.deepEqual(waits, [1000, 2000]);
    await assert.rejects(load(sourceFromKeyword('rice'), 1), /HTTP 403/);
    assert.deepEqual(rotations, [1, 2, 3, 4, 5, 6]);
});
test('location guard mismatch is never retried or rotated', async () => {
    let attempts = 0; let rotations = 0;
    const load = createStorefrontPageLoader({ expectedPincode: '560004',
        newProxyUrl: async () => { rotations += 1; return undefined; },
        wait: async () => assert.fail('Must not retry a location mismatch'),
        fetchPage: async (_source, _page, _proxy, options) => {
            attempts += 1; assert.equal(options.expectedPincode, '560004');
            throw new LocationContextError('Source context mismatch');
        },
    });
    await assert.rejects(load(milk, 1), LocationContextError);
    assert.equal(attempts, 1); assert.equal(rotations, 1);
});
test('direct connections discard failed cookies without enabling a proxy', async () => {
    const calls = [];
    const load = createStorefrontPageLoader({ newProxyUrl: async () => undefined, wait: async () => {},
        fetchPage: async (_source, page, proxy, options) => {
            assert.equal(proxy, undefined); calls.push(options.session);
            if (page === 2 && options.session) throw new Error('HTTP 403');
            return { products: [], numberOfPages: 2, session: session(undefined) };
        },
    });
    await load(milk, 1); await load(milk, 2);
    assert.equal(calls.length, 3); assert.ok(calls[1]); assert.equal(calls[2], undefined);
});
