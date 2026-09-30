import assert from 'node:assert/strict';
import test from 'node:test';

import { checkpointThenCommit } from '../dist/checkpoint.js';

test('publishes saved-row artifacts before advancing any baseline', async () => {
    const order = [];
    const pending = [async () => { order.push('first-baseline'); }, async () => { order.push('second-baseline'); }];
    await checkpointThenCommit(async () => { order.push('artifacts'); }, pending);
    assert.deepEqual(order, ['artifacts', 'first-baseline', 'second-baseline']);
    assert.equal(pending.length, 0);
});

test('failed artifact publication advances no baselines and preserves pending writes', async () => {
    let commits = 0;
    const pending = [async () => { commits += 1; }, async () => { commits += 1; }];
    const original = [...pending];
    await assert.rejects(checkpointThenCommit(async () => { throw new Error('fixture publish failed'); }, pending), /publish failed/);
    assert.equal(commits, 0);
    assert.deepEqual(pending, original);
});

test('a failed baseline commit stays pending while completed writes are not replayed', async () => {
    const order = [];
    let failOnce = true;
    const pending = [
        async () => { order.push('first'); },
        async () => { order.push('second'); if (failOnce) { failOnce = false; throw new Error('fixture commit failed'); } },
        async () => { order.push('third'); },
    ];
    await assert.rejects(checkpointThenCommit(async () => { order.push('publish'); }, pending), /commit failed/);
    assert.equal(pending.length, 2);
    await checkpointThenCommit(async () => { order.push('republish'); }, pending);
    assert.deepEqual(order, ['publish', 'first', 'second', 'republish', 'second', 'third']);
    assert.equal(pending.length, 0);
});
