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
    proxyConfiguration?: ProxyInput;
}

export interface ProductRecord {
    sourceType: 'keyword' | 'category';
    source: string;
    position: number;
    productId: string;
    productName: string;
    brand: string | null;
    packSize: string | null;
    currentPrice: number;
    marketPrice: number | null;
    discountPercent: number | null;
    savingsAmount: number | null;
    currency: 'INR';
    unitPrice: string | null;
    rating: number | null;
    ratingCount: number | null;
    reviewCount: number | null;
    soldText: string | null;
    category: string | null;
    subcategory: string | null;
    inStock: boolean;
    expressDelivery: boolean;
    imageUrl: string | null;
    productUrl: string;
    scrapedAt: string;
}

export interface SourceDefinition {
    sourceType: 'keyword' | 'category';
    source: string;
    type: string;
    slug: string;
}
