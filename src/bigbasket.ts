import { gotScraping } from 'got-scraping';
import { randomUUID } from 'node:crypto';
import type { ProductRecord, SourceDefinition } from './types.js';

const BASE_URL = 'https://www.bigbasket.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';

function numberOrNull(value: unknown): number | null {
    const parsed = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value: unknown): number | null {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function cookieHeader(setCookie: string[] | string | undefined): string {
    const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    return values.map((value) => value.split(';')[0]).filter(Boolean).join('; ');
}

function cleanText(value: unknown): string | null {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (text.toLowerCase() === 'proxied content') return null;
    return text || null;
}

function textOrNA(value: unknown): string {
    return cleanText(value) ?? 'N/A';
}

function cleanImageUrl(value: unknown): string | null {
    const url = cleanText(value);
    if (!url) return null;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`;
    if (url.startsWith('https://')) return url;
    if (url.startsWith('/')) return new URL(url, BASE_URL).toString();
    return null;
}

export function sourceFromKeyword(keyword: string): SourceDefinition {
    return { sourceType: 'keyword', source: keyword, type: 'ps', slug: keyword };
}

export function sourceFromCategoryUrl(value: string): SourceDefinition {
    const url = new URL(value);
    if (!/(^|\.)bigbasket\.com$/i.test(url.hostname)) {
        throw new Error(`Category URL must use bigbasket.com: ${value}`);
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const listingType = parts[0]?.toLowerCase();
    const slug = parts.at(-1) ?? '';
    if (!['pc', 'pb', 'cl'].includes(listingType) || !slug) {
        throw new Error(`Unsupported BigBasket category URL: ${value}`);
    }

    return { sourceType: 'category', source: value, type: listingType, slug };
}

export function buildListingEndpoint(source: SourceDefinition, page: number): URL {
    // BigBasket's Akamai configuration currently rejects the non-trailing-slash
    // route with HTTP 403 while the canonical trailing-slash route works.
    const endpoint = new URL('/listing-svc/v2/products/', BASE_URL);
    endpoint.searchParams.set('type', source.type);
    endpoint.searchParams.set('slug', source.slug);
    endpoint.searchParams.set('page', String(page));
    return endpoint;
}

export function productsFromListingData(
    data: Record<string, any>,
    source: SourceDefinition,
    page: number,
): ProductRecord[] {
    const productInfo = data.tabs?.[0]?.product_info ?? {};
    const rawProducts: any[] = Array.isArray(productInfo.products) ? productInfo.products : [];

    return rawProducts.flatMap((product, index): ProductRecord[] => {
        const price = numberOrNull(product.pricing?.discount?.prim_price?.sp);
        const marketPrice = numberOrNull(product.pricing?.discount?.mrp);
        const productId = cleanText(product.id);
        const productName = cleanText(product.desc);
        const absoluteUrl = cleanText(product.absolute_url);
        if (price === null || !productId || !productName || !absoluteUrl) return [];

        const savings = marketPrice !== null && marketPrice > price ? marketPrice - price : null;
        const discountPercent = savings !== null && marketPrice && marketPrice > 0
            ? Math.round((savings / marketPrice) * 100)
            : null;
        const inStock = product.availability?.avail_status === '001' && product.availability?.not_for_sale !== true;
        const basePrice = cleanText(product.pricing?.discount?.prim_price?.base_price);
        const baseUnit = cleanText(product.pricing?.discount?.prim_price?.base_unit);

        return [{
            source: 'bigbasket',
            searchQuery: textOrNA(source.source),
            position: ((page - 1) * Math.max(rawProducts.length, 1)) + index + 1,
            productId,
            title: productName,
            brand: textOrNA(product.brand?.name),
            price,
            mrp: marketPrice,
            discountPercent,
            currency: 'INR',
            packSize: cleanText(product.w) ?? (basePrice && baseUnit ? `${basePrice}/${baseUnit}` : 'N/A'),
            category: textOrNA(product.category?.tlc_name ?? product.category?.llc_name ?? product.category?.mlc_name),
            rating: numberOrNull(product.rating_info?.avg_rating),
            ratingCount: integerOrNull(product.rating_info?.rating_count),
            inStock,
            imageUrl: cleanImageUrl(product.images?.[0]?.l ?? product.images?.[0]?.m ?? product.images?.[0]?.s),
            productUrl: new URL(absoluteUrl, BASE_URL).toString(),
            scrapedAt: new Date().toISOString(),
        }];
    });
}

export async function fetchProductPage(
    source: SourceDefinition,
    page: number,
    proxyUrl?: string,
): Promise<{ products: ProductRecord[]; numberOfPages: number }> {
    const landingUrl = source.sourceType === 'keyword'
        ? `${BASE_URL}/ps/?q=${encodeURIComponent(source.slug)}`
        : source.source;

    const commonHeaders = {
        'user-agent': USER_AGENT,
        'accept-language': 'en-IN,en;q=0.9',
    };

    const landing = await gotScraping({
        url: landingUrl,
        proxyUrl,
        headers: { ...commonHeaders, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
        responseType: 'text',
        throwHttpErrors: false,
        timeout: { request: 60_000 },
    });
    if (landing.statusCode >= 400) throw new Error(`BigBasket landing page returned HTTP ${landing.statusCode}`);

    const cookie = cookieHeader(landing.headers['set-cookie']);
    const endpoint = buildListingEndpoint(source, page);

    const response = await gotScraping({
        url: endpoint,
        proxyUrl,
        headers: {
            ...commonHeaders,
            accept: '*/*',
            referer: landingUrl,
            cookie,
            'content-type': 'application/json',
            'x-requested-with': 'XMLHttpRequest',
            'osmos-enabled': 'true',
            'x-channel': 'BB-WEB',
            'x-caller': 'UIKIRK',
            'x-tracker': randomUUID(),
            'x-entry-context': 'bb-b2c',
            'x-entry-context-id': '100',
            'x-integrated-fc-door-visible': 'true',
            'common-client-static-version': '101',
        },
        responseType: 'text',
        throwHttpErrors: false,
        timeout: { request: 60_000 },
    });

    if (response.statusCode >= 400) throw new Error(`BigBasket listing API returned HTTP ${response.statusCode}`);
    const data = JSON.parse(response.body) as Record<string, any>;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
        throw new Error(`BigBasket listing API error: ${data.errors[0]?.msg ?? 'unknown error'}`);
    }

    const productInfo = data.tabs?.[0]?.product_info ?? {};
    const products = productsFromListingData(data, source, page);

    return {
        products,
        numberOfPages: integerOrNull(productInfo.number_of_pages) ?? page,
    };
}
