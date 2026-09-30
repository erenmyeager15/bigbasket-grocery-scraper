import type {
    ProductChangeType,
    ProductRecord,
    ProductSnapshot,
    ProductObservation,
    TrackedProductRecord,
} from './types.js';
import { createHash } from 'node:crypto';

export interface TrackingOptions {
    contextKey?: string;
    contextAvailable?: boolean;
    trackingRegion?: string;
    historyLimit?: number;
    includeHistory?: boolean;
    priceChangeThresholdPercent?: number;
    priceChangeThresholdAbsolute?: number;
    alertOnStockChanges?: boolean;
}

function round(value: number, places = 2): number {
    const factor = 10 ** places;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isNullableNumber(value: unknown): value is number | null {
    return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isNullableBoolean(value: unknown): value is boolean | null {
    return value === null || typeof value === 'boolean';
}

export function parseProductSnapshot(value: unknown): ProductSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Partial<ProductSnapshot>;

    if (typeof candidate.title !== 'string'
        || !isNullableNumber(candidate.price)
        || !isNullableBoolean(candidate.inStock)
        || typeof candidate.firstSeenAt !== 'string'
        || typeof candidate.lastSeenAt !== 'string'
        || !Number.isFinite(Date.parse(candidate.firstSeenAt))
        || !Number.isFinite(Date.parse(candidate.lastSeenAt))) {
        return null;
    }

    return {
        productId: typeof candidate.productId === 'string' ? candidate.productId : null,
        productUrl: typeof candidate.productUrl === 'string' ? candidate.productUrl : null,
        title: candidate.title,
        price: candidate.price,
        inStock: candidate.inStock,
        firstSeenAt: candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt,
        packIdentity: typeof candidate.packIdentity === 'string' ? candidate.packIdentity : null,
        packSize: typeof candidate.packSize === 'string' ? candidate.packSize : undefined,
        contextKey: typeof candidate.contextKey === 'string' ? candidate.contextKey : undefined,
        history: Array.isArray(candidate.history) ? candidate.history.filter((item): item is ProductObservation => {
            return !!item && typeof item === 'object'
                && typeof item.observedAt === 'string' && Number.isFinite(Date.parse(item.observedAt))
                && isNullableNumber(item.price) && isNullableBoolean(item.inStock)
                && typeof item.packSize === 'string';
        }).map(({ observedAt, price, inStock, packSize }) => ({ observedAt, price, inStock, packSize }))
            .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).slice(-90) : [],
    };
}

export function trackingKey(product: ProductRecord, contextKey?: string): string {
    if (contextKey !== undefined) {
        const hash = createHash('sha256').update(JSON.stringify([
            contextKey, product.productId ?? product.productUrl ?? `${product.brand}:${product.title}`,
        ])).digest('hex');
        return `PRODUCT_V2_${hash}`;
    }
    if (product.productId && /^[A-Za-z0-9_-]+$/.test(product.productId)) {
        return `PRODUCT_${product.productId}`;
    }

    const identity = product.productUrl ?? `${product.brand}:${product.title}:${product.packSize}`;
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index += 1) {
        hash ^= identity.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `PRODUCT_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function changeTypeFor(
    priceChange: number | null,
    previousInStock: boolean | null,
    currentInStock: boolean | null,
): ProductChangeType {
    if (priceChange !== null && priceChange < 0) return 'price_drop';
    if (priceChange !== null && priceChange > 0) return 'price_increase';
    if (previousInStock === false && currentInStock === true) return 'back_in_stock';
    if (previousInStock === true && currentInStock === false) return 'out_of_stock';
    return 'unchanged';
}

export function trackProduct(
    product: ProductRecord,
    previous: ProductSnapshot | null,
    options: TrackingOptions = {},
): { record: TrackedProductRecord; snapshot: ProductSnapshot } {
    const contextKey = options.contextKey ?? 'unverified-default';
    const historyLimit = Math.max(1, Math.min(90, options.historyLimit ?? 20));
    const stale = previous !== null && Date.parse(product.scrapedAt) <= Date.parse(previous.lastSeenAt);
    const skippedReason = !previous ? 'no_previous_snapshot'
        : stale ? 'observation_not_newer'
        : options.contextAvailable === false ? 'source_context_unavailable'
        : previous.contextKey !== contextKey ? 'delivery_context_changed_or_legacy'
        : previous.packIdentity !== product.packIdentity ? 'pack_size_changed'
        : !product.packIdentity && previous.packSize !== product.packSize ? 'unrecognized_pack_size_changed'
        : null;
    const canCompare = previous !== null && skippedReason === null;
    const reset = previous !== null && skippedReason !== null && !stale;
    const firstSeenAt = reset ? product.scrapedAt : previous?.firstSeenAt ?? product.scrapedAt;
    const previousPrice = canCompare ? previous.price : null;
    const previousInStock = canCompare ? previous.inStock : null;
    const comparablePrices = canCompare && previousPrice !== null && product.price !== null;
    const priceChange = comparablePrices ? round(product.price! - previousPrice!) : null;
    const priceChangePercent = comparablePrices && previousPrice! > 0
        ? round((priceChange! / previousPrice!) * 100)
        : null;
    const stockChanged = canCompare
        && previousInStock !== null
        && product.inStock !== null
        && previousInStock !== product.inStock;
    const priceChanged = priceChange !== null && priceChange !== 0;
    const changeType: ProductChangeType = previous === null
        ? 'new'
        : reset ? 'baseline_reset'
        : changeTypeFor(priceChange, previousInStock, product.inStock);

    const changeTypes: ProductChangeType[] = [];
    if (priceChanged) changeTypes.push(priceChange! < 0 ? 'price_drop' : 'price_increase');
    if (stockChanged) changeTypes.push(product.inStock ? 'back_in_stock' : 'out_of_stock');
    if (!changeTypes.length) changeTypes.push(changeType);
    const alertReasons: string[] = [];
    const percentThreshold = options.priceChangeThresholdPercent ?? 0;
    if (priceChanged && Math.abs(priceChange!) >= (options.priceChangeThresholdAbsolute ?? 0)
        && (percentThreshold === 0 || (priceChangePercent !== null && Math.abs(priceChangePercent) >= percentThreshold))) {
        alertReasons.push(priceChange! < 0 ? 'price_drop' : 'price_increase');
    }
    if (stockChanged && options.alertOnStockChanges !== false) {
        alertReasons.push(product.inStock ? 'back_in_stock' : 'out_of_stock');
    }
    const observation: ProductObservation = {
        observedAt: product.scrapedAt, price: product.price, inStock: product.inStock, packSize: product.packSize,
    };
    const retainedHistory = canCompare ? previous.history ?? [] : [];
    const history = stale ? previous!.history ?? [] : [...retainedHistory, observation].slice(-historyLimit);

    return {
        record: {
            ...product,
            trackingEnabled: true,
            changeDetected: previous !== null && (priceChanged || stockChanged),
            changeType,
            previousPrice,
            priceChange,
            priceChangePercent,
            previousInStock,
            stockChanged,
            firstSeenAt,
            previousScrapedAt: previous?.lastSeenAt ?? null,
            changeTypes,
            alertTriggered: alertReasons.length > 0,
            alertReasons,
            comparisonSkippedReason: skippedReason,
            historyCount: history.length,
            trackingRegion: options.trackingRegion ?? 'unspecified',
            ...(options.includeHistory ? { priceHistory: history } : {}),
        },
        snapshot: stale ? previous! : {
            productId: product.productId,
            productUrl: product.productUrl,
            title: product.title,
            price: product.price,
            inStock: product.inStock,
            firstSeenAt,
            lastSeenAt: product.scrapedAt,
            packIdentity: product.packIdentity,
            packSize: product.packSize,
            contextKey,
            history,
        },
    };
}
