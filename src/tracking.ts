import type {
    ProductChangeType,
    ProductRecord,
    ProductSnapshot,
    TrackedProductRecord,
} from './types.js';

function round(value: number, places = 2): number {
    const factor = 10 ** places;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isNullableNumber(value: unknown): value is number | null {
    return value === null || (typeof value === 'number' && Number.isFinite(value));
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
        || typeof candidate.lastSeenAt !== 'string') {
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
    };
}

export function trackingKey(product: ProductRecord): string {
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
): { record: TrackedProductRecord; snapshot: ProductSnapshot } {
    const firstSeenAt = previous?.firstSeenAt ?? product.scrapedAt;
    const previousPrice = previous?.price ?? null;
    const previousInStock = previous?.inStock ?? null;
    const comparablePrices = previous !== null && previous.price !== null && product.price !== null;
    const priceChange = comparablePrices ? round(product.price! - previous.price!) : null;
    const priceChangePercent = comparablePrices && previous.price! > 0
        ? round((priceChange! / previous.price!) * 100)
        : null;
    const stockChanged = previous !== null
        && previous.inStock !== null
        && product.inStock !== null
        && previous.inStock !== product.inStock;
    const priceChanged = priceChange !== null && priceChange !== 0;
    const changeType: ProductChangeType = previous === null
        ? 'new'
        : changeTypeFor(priceChange, previousInStock, product.inStock);

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
        },
        snapshot: {
            productId: product.productId,
            productUrl: product.productUrl,
            title: product.title,
            price: product.price,
            inStock: product.inStock,
            firstSeenAt,
            lastSeenAt: product.scrapedAt,
        },
    };
}
