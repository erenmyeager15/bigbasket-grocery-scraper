import type { ActorInput, ProxyInput } from './types.js';

export interface NormalizedInput {
    keywords: string[];
    categoryUrls: string[];
    brands: string[];
    inStockOnly: boolean;
    maxResults: number;
    maxPagesPerSource: number;
    trackChanges: boolean;
    trackingStoreName: string;
    historyLimit: number;
    includeHistory: boolean;
    priceChangeThresholdPercent: number;
    priceChangeThresholdAbsolute: number;
    alertOnStockChanges: boolean;
    trackingRegion: string;
    expectedPincode: string | null;
    proxyConfiguration: ProxyInput;
}

const DEFAULT_PROXY_CONFIGURATION: ProxyInput = {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
    apifyProxyCountry: 'IN',
};

function fail(message: string, field?: string): never {
    throw new Error(field ? `Field "${field}": ${message}` : message);
}

function asStringArray(value: unknown, fieldName: string, defaultValue: string[], maxItems: number): string[] {
    if (value === undefined || value === null) return [...defaultValue];
    if (!Array.isArray(value)) fail('must be an array of strings.', fieldName);

    const result = (value as unknown[]).map((item) => {
        if (typeof item !== 'string') fail('all items must be strings.', fieldName);
        const trimmed = item.trim();
        if (!trimmed) fail('items must not be empty.', fieldName);
        return trimmed;
    });

    if (result.length > maxItems) fail(`must contain at most ${maxItems} items.`, fieldName);
    return [...new Set(result)];
}

function asIntInRange(value: unknown, fieldName: string, defaultValue: number, min: number, max: number): number {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (!Number.isInteger(parsed)) fail('must be an integer.', fieldName);
    const numberValue = parsed as number;
    if (numberValue < min || numberValue > max) fail(`must be between ${min} and ${max}.`, fieldName);
    return numberValue;
}

function asBoolean(value: unknown, fieldName: string, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    fail('must be a boolean.', fieldName);
}

function asProxyConfiguration(value: unknown): ProxyInput {
    if (value === undefined || value === null || value === '') return { ...DEFAULT_PROXY_CONFIGURATION };
    if (typeof value !== 'object' || Array.isArray(value)) fail('must be a proxy configuration object.', 'proxyConfiguration');
    return value as ProxyInput;
}

function asNumberInRange(value: unknown, fieldName: string, defaultValue: number, max: number): number {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0 || parsed > max) {
        fail(`must be a finite number between 0 and ${max}.`, fieldName);
    }
    return parsed;
}

function asTrackingRegion(value: unknown): string {
    if (value === undefined || value === null || value === '') return 'unspecified';
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,63}$/.test(value)) {
        fail('must be 1-63 letters, numbers, underscores, or hyphens. This label does not select a delivery location.', 'trackingRegion');
    }
    return value.toLowerCase();
}

function asExpectedPincode(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !/^[1-9]\d{5}$/.test(value)) fail('must be a six-digit Indian pincode string. This guard does not select a delivery location.', 'expectedPincode');
    return value;
}

function asTrackingStoreName(value: unknown): string {
    if (value === undefined || value === null || value === '') return 'bigbasket-price-history';
    if (typeof value !== 'string') fail('must be a string.', 'trackingStoreName');

    const trimmed = value.trim();
    if (!/^[A-Za-z0-9_-]{3,63}$/.test(trimmed)) {
        fail('must be 3-63 characters using only letters, numbers, underscores, or hyphens.', 'trackingStoreName');
    }
    return trimmed;
}

export function normalizeInput(raw: ActorInput = {}): NormalizedInput {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Input must be a JSON object.');

    const rawCategoryUrls = asStringArray(raw.categoryUrls, 'categoryUrls', [], 10);
    const defaultKeywords = rawCategoryUrls.length > 0 ? [] : ['milk'];
    const keywords = asStringArray(raw.keywords, 'keywords', defaultKeywords, 5);
    const categoryUrls = rawCategoryUrls;

    if (keywords.length === 0 && categoryUrls.length === 0) {
        fail('Provide at least one keyword or BigBasket category URL.');
    }

    return {
        keywords,
        categoryUrls,
        brands: asStringArray(raw.brands, 'brands', [], 20),
        inStockOnly: asBoolean(raw.inStockOnly, 'inStockOnly', true),
        maxResults: asIntInRange(raw.maxResults, 'maxResults', 1, 1, 1000),
        maxPagesPerSource: asIntInRange(raw.maxPagesPerSource, 'maxPagesPerSource', 1, 1, 25),
        trackChanges: asBoolean(raw.trackChanges, 'trackChanges', false),
        trackingStoreName: asTrackingStoreName(raw.trackingStoreName),
        historyLimit: asIntInRange(raw.historyLimit, 'historyLimit', 20, 1, 90),
        includeHistory: asBoolean(raw.includeHistory, 'includeHistory', false),
        priceChangeThresholdPercent: asNumberInRange(raw.priceChangeThresholdPercent, 'priceChangeThresholdPercent', 0, 1000),
        priceChangeThresholdAbsolute: asNumberInRange(raw.priceChangeThresholdAbsolute, 'priceChangeThresholdAbsolute', 0, 1_000_000),
        alertOnStockChanges: asBoolean(raw.alertOnStockChanges, 'alertOnStockChanges', true),
        trackingRegion: asTrackingRegion(raw.trackingRegion),
        expectedPincode: asExpectedPincode(raw.expectedPincode),
        proxyConfiguration: asProxyConfiguration(raw.proxyConfiguration),
    };
}
