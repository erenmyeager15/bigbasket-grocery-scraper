import { fetchProductPage } from './bigbasket.js';
import type { AnonymousStorefrontSession } from './bigbasket.js';
import { LocationContextError } from './location.js';
import type { SourceDefinition } from './types.js';

/** Retain the working storefront; retire failed sessions rather than cycling back. */
export function createStorefrontPageLoader(options: {
    newProxyUrl: (rotation: number) => Promise<string | undefined>;
    expectedPincode?: string | null;
    fetchPage?: typeof fetchProductPage;
    wait?: (milliseconds: number) => Promise<void>;
    onFailure?: (attempt: number, error: unknown) => void;
}) {
    let active: { proxyUrl?: string; session: AnonymousStorefrontSession } | undefined;
    let rotation = 0;
    const fetchPage = options.fetchPage ?? fetchProductPage;
    const wait = options.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    return async (source: SourceDefinition, page: number) => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                const proxyUrl = active ? active.proxyUrl : await options.newProxyUrl(++rotation);
                const result = await fetchPage(source, page, proxyUrl, {
                    session: active?.session, expectedPincode: options.expectedPincode,
                });
                active = { proxyUrl, session: result.session };
                return result;
            } catch (error) {
                active = undefined;
                // A guard mismatch is intentional and must not be evaded by rotation.
                if (error instanceof LocationContextError) throw error;
                lastError = error;
                options.onFailure?.(attempt, error);
                if (attempt < 3) await wait(1000 * attempt);
            }
        }
        throw lastError;
    };
}
