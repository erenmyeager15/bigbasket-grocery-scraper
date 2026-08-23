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
    category: string;
    rating: number | null;
    ratingCount: number | null;
    inStock: boolean | null;
    productUrl: string | null;
    imageUrl: string | null;
    scrapedAt: string;
}

export type ProductChangeType = 'new' | 'unchanged' | 'price_drop' | 'price_increase' | 'back_in_stock' | 'out_of_stock';

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
}

export interface ProductSnapshot {
    productId: string | null;
    productUrl: string | null;
    title: string;
    price: number | null;
    inStock: boolean | null;
    firstSeenAt: string;
    lastSeenAt: string;
}

export type TrackedProductRecord = ProductRecord & ProductTrackingFields;

export interface SourceDefinition {
    sourceType: 'keyword' | 'category';
    source: string;
    type: string;
    slug: string;
}
