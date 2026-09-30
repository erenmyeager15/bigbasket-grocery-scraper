/** Publish saved-row alerts before advancing their cross-run baselines. */
export async function checkpointThenCommit(
    publish: () => Promise<void>,
    pending: Array<() => Promise<void>>,
): Promise<void> {
    await publish();
    while (pending.length > 0) {
        await pending[0]();
        pending.shift();
    }
}
