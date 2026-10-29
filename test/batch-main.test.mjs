import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const fixtureEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:APIFY|ACTOR|CRAWLEE)_/.test(name)));
function run(scenario) {
    const child = spawnSync(process.execPath, ['--max-old-space-size=256', 'test/helpers/run-main-fixture.mjs', scenario], {
        cwd: root, encoding: 'utf8', timeout: 20000,
        env: fixtureEnv,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message || child.stdout);
    const line = child.stdout.split(/\r?\n/).find(value => value.startsWith('FIXTURE_RESULT:'));
    assert(line, child.stdout);
    return JSON.parse(line.slice('FIXTURE_RESULT:'.length));
}
for (const scenario of ['large-batch', 'malformed-row', 'recoverable-429']) {
    test(`actual collection loop saves 1,000 unique rows with bounded tracking: ${scenario}`, () => {
        const result = run(scenario);
        assert.equal(result.error, null);
        assert.equal(result.exited, true);
        assert.equal(result.savedCount, 1000);
        assert.equal(result.chargedCount, 1000);
        assert.equal(result.duplicateSaves, 0);
        assert.equal(result.snapshotWrites, 1000);
        assert.equal(result.maxHistory, 90);
        assert.equal(result.summary.savedCount, 1000);
        assert.equal(result.summary.trackedCount, 1000);
        assert.equal(result.summary.collectionStatus, 'bounded_window');
        assert.equal(result.summary.sourceCoverage[0].invalidProductCount, scenario === 'malformed-row' ? 2 : 0);
        assert.equal(result.listingRequests.filter(page => page === 12).length, scenario === 'recoverable-429' ? 2 : 1);
    });
}
test('stops on a repeated source page without extra product charges or requests', () => {
    const result = run('duplicate-page');
    assert.equal(result.savedCount, 40);
    assert.equal(result.chargedCount, 40);
    assert.deepEqual(result.listingRequests, [1, 2]);
    assert.equal(result.summary.collectionStatus, 'partial');
    assert.equal(result.summary.sourceCoverage[0].reason, 'repeated_page');
});
test('an empty later page ends the source without requesting the remaining declared pages', () => {
    const result = run('empty-later-page');
    assert.equal(result.savedCount, 80);
    assert.deepEqual(result.listingRequests, [1, 2, 3]);
    assert.equal(result.summary.collectionStatus, 'partial');
    assert.equal(result.summary.sourceCoverage[0].reason, 'empty_before_declared_end');
});
test('a spending cap stops exactly at the affordable row, with no later page or unpaid baseline', () => {
    const result = run('spending-cap');
    assert.equal(result.savedCount, 41);
    assert.equal(result.chargedCount, 41);
    assert.equal(result.snapshotWrites, 41);
    assert.deepEqual(result.listingRequests, [1, 2]);
    assert.equal(result.summary.collectionStatus, 'budget_limited');
});
test('an exhausted budget stops before proxy setup and source requests', () => {
    const result = run('empty-budget');
    assert.equal(result.savedCount, 0);
    assert.equal(result.chargedCount, 0);
    assert.equal(result.initializedProxy, false);
    assert.deepEqual(result.listingRequests, []);
    assert.equal(result.summary.collectionStatus, 'budget_limited');
});
test('one-row catalog collection still works with tracking disabled', () => {
    const result = run('small-catalog');
    assert.equal(result.error, null);
    assert.equal(result.savedCount, 1);
    assert.equal(result.chargedCount, 1);
    assert.equal(result.snapshotReads, 0);
    assert.equal(result.snapshotWrites, 0);
    assert.deepEqual(result.listingRequests, [1]);
    assert.equal(result.summary.trackedCount, 0);
});
test('source overlap is deduplicated without mistaking a new source for a repeated page', () => {
    const result = run('overlapping-sources');
    assert.equal(result.error, null);
    assert.equal(result.savedCount, 120);
    assert.equal(result.chargedCount, 120);
    assert.equal(result.duplicateSaves, 0);
    assert.deepEqual(result.listingRequests, [1, 2, 1, 2]);
    assert.deepEqual(result.summary.sourceCoverage.map(source => source.savedCount), [80, 40]);
});
test('pages excluded by a brand filter do not trigger the duplicate-page guard', () => {
    const result = run('filtered-pages');
    assert.equal(result.error, null);
    assert.equal(result.savedCount, 40);
    assert.deepEqual(result.listingRequests, [1, 2, 3]);
});
test('a later source failure retains saved rows and reports partial coverage', () => {
    const result = run('later-source-failure');
    assert.equal(result.error, null);
    assert.equal(result.savedCount, 80);
    assert.equal(result.chargedCount, 80);
    assert.equal(result.snapshotWrites, 80);
    assert.deepEqual(result.listingRequests, [1, 2, 3, 3, 3]);
    assert.equal(result.summary.collectionStatus, 'partial');
    assert.equal(result.summary.sourceCoverage[0].reason, 'request_failed');
});
test('a source location mismatch remains a failure before product collection', () => {
    const result = run('guard-mismatch');
    assert.match(result.error, /not expected/);
    assert.equal(result.savedCount, 0);
    assert.equal(result.headerRequests, 1);
    assert.deepEqual(result.listingRequests, []);
    assert.equal(result.summary.collectionStatus, 'location_guard_failed');
});
test('all source requests failing still fails the Actor rather than presenting a clean empty run', () => {
    const result = run('all-sources-failed');
    assert.match(result.error, /no saved products/);
    assert.equal(result.exited, false);
    assert.equal(result.savedCount, 0);
    assert.equal(result.landingRequests, 3);
    assert.equal(result.summary.collectionStatus, 'partial');
});
test('a dataset delivery error preserves prior output and stops without unpaid tracking writes', () => {
    const result = run('delivery-failure');
    assert.match(result.error, /dataset delivery failure/);
    assert.equal(result.exited, false);
    assert.equal(result.savedCount, 80);
    assert.equal(result.chargedCount, 80);
    assert.equal(result.snapshotWrites, 80);
    assert.equal(result.summary.savedCount, 80);
    assert.equal(result.summary.collectionStatus, 'interrupted');
});
