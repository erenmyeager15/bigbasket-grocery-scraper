import { gotScraping } from 'got-scraping';
import { randomUUID } from 'node:crypto';
import { packFacts } from './catalog.js';
import { assertExpectedPincode, bindProductContext, LocationContextError, sourceContextFromHeader } from './location.js';
import type { SourceLocationContext } from './location.js';
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

function mergeCookies(existing: string, setCookie: string[] | string | undefined): string {
    const pairs = [...existing.split('; '), ...cookieHeader(setCookie).split('; ')].filter(Boolean);
    const values = new Map<string, string>();
    for (const pair of pairs) {
        const separator = pair.indexOf('=');
        if (separator > 0) values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return [...values].map(([name, value]) => `${name}=${value}`).join('; ');
}

export interface AnonymousStorefrontSession {
    cookie: string;
    proxyUrl?: string;
    locationContext: SourceLocationContext | null;
}

export interface StorefrontRequestOptions {
    url: string | URL;
    proxyUrl?: string;
    headers: Record<string, string>;
    responseType: 'text';
    throwHttpErrors: false;
    timeout: { request: number };
}

export type StorefrontHttpClient = (options: StorefrontRequestOptions) => Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
}>;

const defaultHttpClient: StorefrontHttpClient = async options => {
    const response = await gotScraping(options);
    return { statusCode: response.statusCode, body: response.body, headers: response.headers };
};

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
    locationContext: SourceLocationContext | null = null,
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
        // Do not turn missing or unrecognized availability into a stock-change event.
        const inStock = product.availability?.not_for_sale === true ? false
            : product.availability?.avail_status === '001' ? true : null;
        // A price-per-unit label is not the package quantity.
        const packSize = cleanText(product.w) ?? 'N/A';

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
            packSize,
            ...packFacts(packSize, price),
            ...bindProductContext(product.visibility, locationContext),
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
    options: {
        session?: AnonymousStorefrontSession;
        expectedPincode?: string | null;
        request?: StorefrontHttpClient;
    } = {},
): Promise<{ products: ProductRecord[]; numberOfPages: number; session: AnonymousStorefrontSession }> {
    const landingUrl = source.sourceType === 'keyword'
        ? `${BASE_URL}/ps/?q=${encodeURIComponent(source.slug)}`
        : source.source;

    const commonHeaders = {
        'user-agent': USER_AGENT,
        'accept-language': 'en-IN,en;q=0.9',
    };

    const request = options.request ?? defaultHttpClient;
    let session = options.session;
    if (session && session.proxyUrl !== proxyUrl) throw new Error('Anonymous storefront session cannot be reused with a different proxy.');
    if (!session) {
    const landing = await request({
        url: landingUrl,
        proxyUrl,
        headers: { ...commonHeaders, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
        responseType: 'text',
        throwHttpErrors: false,
        timeout: { request: 60_000 },
    });
    if (landing.statusCode >= 400) throw new Error(`BigBasket landing page returned HTTP ${landing.statusCode}`);

    let cookie = cookieHeader(landing.headers['set-cookie']);
    let locationContext: SourceLocationContext | null = null;
    try {
        const header = await request({
            url: new URL('/ui-svc/v2/header/?send_door_info=true&send_address_set_by_user=true', BASE_URL),
            proxyUrl,
            headers: { ...commonHeaders, cookie, accept: 'application/json', referer: landingUrl,
                'x-entry-context': 'bb-b2c', 'x-entry-context-id': '100', 'x-channel': 'BB-WEB' },
            responseType: 'text', throwHttpErrors: false, timeout: { request: 15_000 },
        });
        if (header.statusCode < 400) {
            locationContext = sourceContextFromHeader(JSON.parse(header.body));
            cookie = mergeCookies(cookie, header.headers['set-cookie']);
        }
    } catch {
        // Normal catalog collection can continue, but no location claim or history comparison is made.
        locationContext = null;
    }
    session = { cookie, proxyUrl, locationContext };
    }
    assertExpectedPincode(options.expectedPincode, session.locationContext);
    const endpoint = buildListingEndpoint(source, page);

    const response = await request({
        url: endpoint,
        proxyUrl,
        headers: {
            ...commonHeaders,
            accept: '*/*',
            referer: landingUrl,
            cookie: session.cookie,
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
    session.cookie = mergeCookies(session.cookie, response.headers['set-cookie']);
    const data = JSON.parse(response.body) as Record<string, any>;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
        throw new Error(`BigBasket listing API error: ${data.errors[0]?.msg ?? 'unknown error'}`);
    }

    const productInfo = data.tabs?.[0]?.product_info ?? {};
    const products = productsFromListingData(data, source, page, session.locationContext);
    if (options.expectedPincode && products.some(product => product.locationContextStatus !== 'source_assigned')) {
        throw new LocationContextError('BigBasket product service-area/fulfillment metadata could not be linked to the reported source pincode. No products from this page were saved.');
    }

    return {
        products,
        numberOfPages: integerOrNull(productInfo.number_of_pages) ?? page,
        session,
    };
}
