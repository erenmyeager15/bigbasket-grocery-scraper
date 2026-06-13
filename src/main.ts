import { Actor, log } from 'apify';
import { fetchProductPage, sourceFromCategoryUrl, sourceFromKeyword } from './bigbasket.js';
import type { ActorInput, SourceDefinition } from './types.js';

await Actor.init();

const input = (await Actor.getInput<ActorInput>()) ?? {};
const keywords = [...new Set((input.keywords ?? []).map((value) => value.trim()).filter(Boolean))];
const categoryUrls = [...new Set((input.categoryUrls ?? []).map((value) => value.trim()).filter(Boolean))];
const brands = new Set((input.brands ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
const maxResults = Math.min(Math.max(input.maxResults ?? 100, 1), 1000);
const maxPagesPerSource = Math.min(Math.max(input.maxPagesPerSource ?? 10, 1), 25);
const inStockOnly = input.inStockOnly ?? false;

if (keywords.length === 0 && categoryUrls.length === 0) {
    throw new Error('Provide at least one keyword or BigBasket category URL.');
}

const sources: SourceDefinition[] = [
    ...keywords.map(sourceFromKeyword),
    ...categoryUrls.map(sourceFromCategoryUrl),
];

const proxyConfiguration = await Actor.createProxyConfiguration(
    input.proxyConfiguration ?? {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
        apifyProxyCountry: 'IN',
    },
);

const seenProductIds = new Set<string>();
let savedCount = 0;
let spendingLimitReached = false;

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

        if (!result) throw lastError instanceof Error ? lastError : new Error(String(lastError));
        if (page === 1 && result.products.length === 0) {
            throw new Error(`No BigBasket products found for ${source.source}`);
        }

        for (const product of result.products) {
            if (savedCount >= maxResults) break;
            if (seenProductIds.has(product.productId)) continue;
            if (brands.size > 0 && (!product.brand || !brands.has(product.brand.toLowerCase()))) continue;
            if (inStockOnly && !product.inStock) continue;

            seenProductIds.add(product.productId);
            await Actor.pushData(product);
            const chargeResult = await Actor.charge({ eventName: 'product-scraped' });
            savedCount += 1;

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
        await Actor.setStatusMessage(`Saved ${savedCount}/${maxResults} BigBasket products`);

        if (page >= result.numberOfPages) break;
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.floor(Math.random() * 1_000)));
    }
}

if (!spendingLimitReached) {
    await Actor.setStatusMessage(`Finished with ${savedCount} unique products`);
}
log.info(`BigBasket scrape finished with ${savedCount} unique products.`);
await Actor.exit();
