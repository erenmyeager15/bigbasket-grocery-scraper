import { Actor, log } from 'apify';
import { fetchProductPage, sourceFromCategoryUrl, sourceFromKeyword } from './bigbasket.js';
import { normalizeInput } from './input.js';
import { parseProductSnapshot, trackProduct, trackingKey } from './tracking.js';
import type { ActorInput, ProductSnapshot, SourceDefinition } from './types.js';

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

const proxyConfiguration = await Actor.createProxyConfiguration(
    proxyInput,
);
const trackingStore = trackChanges
    ? await Actor.openKeyValueStore(trackingStoreName)
    : null;

if (trackingStore) {
    log.info('Run-to-run price and stock tracking enabled', { trackingStoreName });
}

const seenProductIds = new Set<string>();
let savedCount = 0;
let spendingLimitReached = false;
let successfulPageCount = 0;

for (const [sourceIndex, source] of sources.entries()) {
    if (spendingLimitReached) break;

    for (let page = 1; page <= maxPagesPerSource && savedCount < maxResults && !spendingLimitReached; page += 1) {
        let result: Awaited<ReturnType<typeof fetchProductPage>> | null = null;
        let lastError: unknown;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                const proxyUrl = await proxyConfiguration?.newUrl(`bb_${sourceIndex}_${page}_${attempt}`);
                result = await fetchProductPage(source, page, proxyUrl);
                break;
            } catch (error) {
                lastError = error;
                log.warning(`BigBasket request attempt ${attempt}/3 failed`, {
                    source: source.source,
                    page,
                    error: String(error),
                });
                await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
            }
        }

        if (!result) {
            const reason = lastError instanceof Error ? lastError.message : String(lastError);
            skippedSources.push({ source: source.source, reason });
            log.warning('Skipping BigBasket source after repeated request failures', {
                source: source.source,
                page,
                reason,
            });
            break;
        }

        successfulPageCount += 1;

        if (page === 1 && result.products.length === 0) {
            log.info('BigBasket source returned no matching products', {
                source: source.source,
            });
            break;
        }

        for (const product of result.products) {
            if (savedCount >= maxResults) break;
            const uniqueKey = product.productId ?? product.productUrl ?? product.title;
            if (!uniqueKey || seenProductIds.has(uniqueKey)) continue;
            if (brands.size > 0 && (!product.brand || !brands.has(product.brand.toLowerCase()))) continue;
            if (inStockOnly && !product.inStock) continue;

            let datasetRecord = product;
            let snapshot: ProductSnapshot | null = null;
            let snapshotKey: string | null = null;

            if (trackingStore) {
                snapshotKey = trackingKey(product);
                const previous = parseProductSnapshot(await trackingStore.getValue(snapshotKey));
                const tracked = trackProduct(product, previous);
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

                if (trackingStore && snapshot && snapshotKey) {
                    try {
                        await trackingStore.setValue(snapshotKey, snapshot);
                    } catch (error) {
                        log.warning('Product was saved, but its tracking snapshot could not be updated', {
                            productId: product.productId,
                            error: String(error),
                        });
                    }
                }
            }

            if (chargeResult.eventChargeLimitReached) {
                spendingLimitReached = true;
                await Actor.setStatusMessage(`Stopped at the user's spending limit after ${savedCount} products`);
                log.info('User spending limit reached; stopping before more requests are made.');
                break;
            }
        }

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

if (!spendingLimitReached) {
    await Actor.setStatusMessage(`Finished with ${savedCount} unique products`);
}
if (savedCount === 0 && successfulPageCount === 0 && !spendingLimitReached) {
    const reasons = skippedSources.map((item) => `${item.source}: ${item.reason}`).join('; ');
    throw new Error(`BigBasket scrape finished with no saved products.${reasons ? ` Skipped sources: ${reasons}` : ''}`);
}
if (skippedSources.length > 0) {
    log.warning('Some BigBasket sources were skipped', { skippedSources });
}
log.info(`BigBasket scrape finished with ${savedCount} unique products.`);
await Actor.exit();
