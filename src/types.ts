export interface ProxyInput {
    useApifyProxy?: boolean;
    apifyProxyGroups?: string[];
    apifyProxyCountry?: string;
    proxyUrls?: string[];
}

export interface ActorInput {
    keywords?: string[];
    categoryUrls?: string[];
    brands?: string[];
    inStockOnly?: boolean;
    maxResults?: number;
    maxPagesPerSource?: number;
    trackChanges?: boolean;
    trackingStoreName?: string;
    historyLimit?: number;
    includeHistory?: boolean;
    priceChangeThresholdPercent?: number;
    priceChangeThresholdAbsolute?: number;
    alertOnStockChanges?: boolean;
    trackingRegion?: string;
    expectedPincode?: string;
    proxyConfiguration?: ProxyInput;
}

export interface ProductRecord {
    source: 'bigbasket';
    searchQuery: string;
    position: number;
    productId: string | null;
    title: string;
    brand: string;
    price: number | null;
    mrp: number | null;
    discountPercent: number | null;
    currency: string;
    packSize: string;
    normalizedPackSize: string | null;
    packIdentity: string | null;
    packNormalizationStatus: 'parsed' | 'unrecognized';
    packCount: number | null;
    totalQuantity: number | null;
    quantityUnit: 'g' | 'ml' | 'piece' | null;
    unitPrice: number | null;
    unitPriceBasis: '100 g' | '1 L' | '1 piece' | null;
    category: string;
    rating: number | null;
    ratingCount: number | null;
    inStock: boolean | null;
    productUrl: string | null;
    imageUrl: string | null;
    scrapedAt: string;
    sourcePincode: string | null;
    sourceCity: string | null;
    sourceCityId: number | null;
    sourceAddressIsPartial: boolean | null;
    sourceServiceAreaId: number | null;
    sourceFulfillmentCenterId: number | null;
    locationContextStatus: 'source_assigned' | 'product_context_only' | 'unavailable';
    deliveryLocationVerified: false;
}

export type ProductChangeType = 'new' | 'unchanged' | 'baseline_reset' | 'price_drop' | 'price_increase' | 'back_in_stock' | 'out_of_stock';

export interface ProductTrackingFields {
    trackingEnabled: true;
    changeDetected: boolean;
    changeType: ProductChangeType;
    previousPrice: number | null;
    priceChange: number | null;
    priceChangePercent: number | null;
    previousInStock: boolean | null;
    stockChanged: boolean;
    firstSeenAt: string;
    previousScrapedAt: string | null;
    changeTypes: ProductChangeType[];
    alertTriggered: boolean;
    alertReasons: string[];
    comparisonSkippedReason: string | null;
    historyCount: number;
    priceHistory?: ProductObservation[];
    trackingRegion: string;
}

export interface ProductObservation {
    observedAt: string;
    price: number | null;
    inStock: boolean | null;
    packSize: string;
}

export interface ProductSnapshot {
    productId: string | null;
    productUrl: string | null;
    title: string;
    price: number | null;
    inStock: boolean | null;
    firstSeenAt: string;
    lastSeenAt: string;
    packIdentity?: string | null;
    packSize?: string;
    contextKey?: string;
    history?: ProductObservation[];
}

export type TrackedProductRecord = ProductRecord & ProductTrackingFields;

export interface SourceDefinition {
    sourceType: 'keyword' | 'category';
    source: string;
    type: string;
    slug: string;
}
