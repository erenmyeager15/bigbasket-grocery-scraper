import { Actor, log } from 'apify';
import { sourceFromCategoryUrl, sourceFromKeyword } from './bigbasket.js';
import { createStorefrontPageLoader, ProductBudgetReachedError } from './storefront-retry.js';
import { LocationContextError } from './location.js';
import { monitoringArtifacts } from './monitoring.js';
import { checkpointThenCommit } from './checkpoint.js';
import { randomUUID } from 'node:crypto';
import { normalizeInput } from './input.js';
import { parseProductSnapshot, trackProduct, trackingKey } from './tracking.js';
import type { ActorInput, ProductSnapshot, SourceCoverage, SourceDefinition, TrackedProductRecord } from './types.js';

await Actor.init();

const input = (await Actor.getInput<ActorInput>()) ?? {};
const normalizedInput = normalizeInput(input);
const {
    categoryUrls,
    keywords,
    maxResults,
    maxPagesPerSource,
    inStockOnly,
    trackChanges,
    trackingStoreName,
    expectedPincode,
    proxyConfiguration: proxyInput,
} = normalizedInput;
const brands = new Set(normalizedInput.brands.map((value) => value.toLowerCase()));

const skippedSources: Array<{ source: string; reason: string }> = [];
const sources: SourceDefinition[] = keywords.map(sourceFromKeyword);
for (const categoryUrl of categoryUrls) {
    try {
        sources.push(sourceFromCategoryUrl(categoryUrl));
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        skippedSources.push({ source: categoryUrl, reason });
        log.warning('Skipping invalid BigBasket category URL', {
            source: categoryUrl,
            reason,
        });
    }
}

if (sources.length === 0) {
    const reasons = skippedSources.map((item) => `${item.source}: ${item.reason}`).join('; ');
    throw new Error(`Provide at least one valid keyword or BigBasket category URL.${reasons ? ` Skipped sources: ${reasons}` : ''}`);
}

const canAffordProduct = () => Actor.getChargingManager().calculateMaxEventChargeCountWithinLimit('product-scraped') > 0;
let spendingLimitReached = !canAffordProduct();
const proxyConfiguration = spendingLimitReached ? undefined : await Actor.createProxyConfiguration(proxyInput);
const trackingStore = trackChanges && !spendingLimitReached
    ? await Actor.openKeyValueStore(trackingStoreName)
    : null;

if (trackingStore) {
    log.info('Run-to-run price and stock tracking enabled', { trackingStoreName });
}

const seenProductIds = new Set<string>();
const proxySessionPrefix = `bb_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
let requestingSource: string | null = null;
let requestingPage = 0;
const loadPage = createStorefrontPageLoader({
    newProxyUrl: async rotation => proxyConfiguration?.newUrl(`${proxySessionPrefix}_${rotation}`),
    expectedPincode,
    canRequest: canAffordProduct,
    onFailure: (attempt, error) => log.warning(`BigBasket request attempt ${attempt}/3 failed`, {
        source: requestingSource, page: requestingPage, error: String(error),
    }),
});
const trackedRecords: TrackedProductRecord[] = [];
let savedCount = 0;
let successfulPageCount = 0;
let trackingPersistenceFailures = 0;
const pendingSnapshots: Array<() => Promise<void>> = [];
let collectionFailureStatus: 'interrupted' | 'location_guard_failed' = 'interrupted';
const sourceCoverage: SourceCoverage[] = sources.map(source => ({
    source: source.source, sourceType: source.sourceType, pagesFetched: 0,
    productsFound: 0, invalidProductCount: 0, savedCount: 0, reason: 'not_started',
}));
let currentCoverage: SourceCoverage | null = null;

async function writeMonitoringArtifacts(collectionStatus: 'running' | 'interrupted' | 'bounded_window' | 'partial' | 'budget_limited' | 'location_guard_failed') {
    const artifacts = monitoringArtifacts(trackedRecords, {
        savedCount, trackingEnabled: trackChanges, trackingStoreId: trackingStore?.id ?? null, sourceCoverage,
        collectionStatus, successfulPageCount, trackingPersistenceFailures, expectedPincode,
    });
    // Alerts must be durable before any baseline is advanced.
    await Actor.setValue('ALERTS', artifacts.alerts);
    await Actor.setValue('MONITORING-SUMMARY', artifacts.summary);
}

async function checkpoint(collectionStatus: Parameters<typeof writeMonitoringArtifacts>[0]) {
    await checkpointThenCommit(() => writeMonitoringArtifacts(collectionStatus), pendingSnapshots);
}

try {
for (const [sourceIndex, source] of sources.entries()) {
    if (spendingLimitReached || savedCount >= maxResults) break;
    const coverage = sourceCoverage[sourceIndex];
    currentCoverage = coverage;
    coverage.reason = 'interrupted';
    const seenSourceProductIds = new Set<string>();

    for (let page = 1; page <= maxPagesPerSource && savedCount < maxResults && !spendingLimitReached; page += 1) {
        let result: Awaited<ReturnType<typeof loadPage>>;
        requestingSource = source.source;
        requestingPage = page;
        try {
            result = await loadPage(source, page);
        } catch (error) {
            if (error instanceof ProductBudgetReachedError) {
                spendingLimitReached = true;
                coverage.reason = 'budget_limited';
                break;
            }
            if (error instanceof LocationContextError) {
                collectionFailureStatus = 'location_guard_failed';
                coverage.reason = 'location_guard_failed';
                throw error;
            }
            coverage.reason = 'request_failed';
            const reason = error instanceof Error ? error.message : String(error);
            skippedSources.push({ source: source.source, reason });
            log.warning('Skipping BigBasket source after repeated request failures', {
                source: source.source,
                page,
                reason,
            });
            break;
        }

        successfulPageCount += 1;
        coverage.pagesFetched += 1;
        coverage.productsFound += result.products.length;
        coverage.invalidProductCount += result.invalidProductCount;

        if (result.products.length === 0) {
            coverage.reason = page < result.numberOfPages ? 'empty_before_declared_end' : 'source_exhausted';
            log.info('BigBasket source returned no matching products', {
                source: source.source,
                page,
            });
            break;
        }

        const sourceProductKeys = result.products.map(product => JSON.stringify([
            product.productId ?? product.productUrl ?? product.title,
            product.sourcePincode, product.sourceServiceAreaId, product.sourceFulfillmentCenterId,
        ]));
        if (sourceProductKeys.every(key => seenSourceProductIds.has(key))) {
            coverage.reason = 'repeated_page';
            log.warning('BigBasket repeated an already observed source page; retaining saved rows and stopping this source', {
                source: source.source, page,
            });
            break;
        }
        for (const key of sourceProductKeys) seenSourceProductIds.add(key);

        for (const product of result.products) {
            if (savedCount >= maxResults) break;
            if (!canAffordProduct()) { spendingLimitReached = true; break; }
            const identity = product.productId ?? product.productUrl ?? product.title;
            if (!identity) continue;
            const uniqueKey = JSON.stringify([identity, product.sourcePincode,
                product.sourceServiceAreaId, product.sourceFulfillmentCenterId]);
            if (seenProductIds.has(uniqueKey)) continue;
            if (brands.size > 0 && (!product.brand || !brands.has(product.brand.toLowerCase()))) continue;
            if (inStockOnly && !product.inStock) continue;

            let datasetRecord = product;
            let snapshot: ProductSnapshot | null = null;
            let snapshotKey: string | null = null;

            if (trackingStore) {
                const contextKey = JSON.stringify([
                    normalizedInput.trackingRegion,
                    product.sourcePincode, product.sourceCityId,
                    product.sourceServiceAreaId, product.sourceFulfillmentCenterId,
                ]);
                snapshotKey = trackingKey(product, contextKey);
                const previous = parseProductSnapshot(await trackingStore.getValue(snapshotKey));
                const tracked = trackProduct(product, previous, {
                    ...normalizedInput, contextKey,
                    contextAvailable: product.locationContextStatus === 'source_assigned',
                });
                datasetRecord = tracked.record;
                snapshot = tracked.snapshot;
            }

            // Push and charge atomically so records beyond the user's charge limit
            // are not saved for free and billing failures stop the run immediately.
            const chargeResult = await Actor.pushData(datasetRecord, 'product-scraped');
            const recordWasSaved = chargeResult.chargedCount > 0 || !chargeResult.eventChargeLimitReached;
            if (recordWasSaved) {
                seenProductIds.add(uniqueKey);
                savedCount += 1;
                coverage.savedCount += 1;
                if (trackChanges) trackedRecords.push(datasetRecord as TrackedProductRecord);

                if (trackingStore && snapshot && snapshotKey && product.locationContextStatus === 'source_assigned'
                    && snapshot.lastSeenAt === product.scrapedAt) {
                    const savedSnapshot = snapshot;
                    const savedSnapshotKey = snapshotKey;
                    pendingSnapshots.push(async () => {
                    try {
                        // Best-effort stale-write fencing; a named history has one writer (no overlapping schedules).
                        const latest = parseProductSnapshot(await trackingStore.getValue(savedSnapshotKey));
                        if (!latest || Date.parse(latest.lastSeenAt) < Date.parse(savedSnapshot.lastSeenAt)) {
                            await trackingStore.setValue(savedSnapshotKey, savedSnapshot);
                        }
                    } catch (error) {
                        trackingPersistenceFailures += 1;
                        log.warning('Product was saved, but its tracking snapshot could not be updated', {
                            productId: product.productId,
                            error: String(error),
                        });
                    }
                    });
                }
            }

            if (chargeResult.eventChargeLimitReached) {
                spendingLimitReached = true;
                await Actor.setStatusMessage(`Stopped at the user's spending limit after ${savedCount} products`);
                log.info('User spending limit reached; stopping before more requests are made.');
                break;
            }
        }

        coverage.reason = spendingLimitReached ? 'budget_limited' : savedCount >= maxResults ? 'result_limit'
            : page >= result.numberOfPages ? 'source_exhausted' : page >= maxPagesPerSource ? 'page_limit' : 'interrupted';
        if (trackChanges) await checkpoint('running');
        log.info(`Processed ${source.source} page ${page}`, {
            productsFound: result.products.length,
            totalSaved: savedCount,
        });

        if (spendingLimitReached) break;

        await Actor.setStatusMessage(`Saved ${savedCount}/${maxResults} BigBasket products`);

        if (page >= result.numberOfPages) break;
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.floor(Math.random() * 1_000)));
    }
}
} catch (error) {
    if (currentCoverage && currentCoverage.reason !== 'location_guard_failed') currentCoverage.reason = 'interrupted';
    // Retain alerts for already saved rows. If publishing fails, leave baselines unchanged.
    try {
        await checkpoint(collectionFailureStatus);
    } catch (checkpointError) {
        log.warning('Monitoring checkpoint could not be published; uncommitted baselines remain unchanged', {
            error: String(checkpointError),
        });
    }
    throw error;
}

const partialCoverage = skippedSources.length > 0 || sourceCoverage.some(source =>
    ['request_failed', 'repeated_page', 'empty_before_declared_end', 'interrupted'].includes(source.reason));
await checkpoint(spendingLimitReached ? 'budget_limited'
    : partialCoverage ? 'partial' : 'bounded_window');
await Actor.setStatusMessage(spendingLimitReached ? `Stopped at the spending limit after ${savedCount} products`
    : `Finished with ${savedCount} unique products${partialCoverage ? '; partial source coverage, see MONITORING-SUMMARY' : ''}`);
if (savedCount === 0 && successfulPageCount === 0 && !spendingLimitReached) {
    const reasons = skippedSources.map((item) => `${item.source}: ${item.reason}`).join('; ');
    throw new Error(`BigBasket scrape finished with no saved products.${reasons ? ` Skipped sources: ${reasons}` : ''}`);
}
if (skippedSources.length > 0) {
    log.warning('Some BigBasket sources were skipped', { skippedSources });
}
log.info(`BigBasket scrape finished with ${savedCount} unique products.`);
await Actor.exit();
