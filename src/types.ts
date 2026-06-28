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

export interface SourceDefinition {
    sourceType: 'keyword' | 'category';
    source: string;
    type: string;
    slug: string;
}
