export interface SourceLocationContext {
    sourcePincode: string;
    sourceCity: string | null;
    sourceCityId: number | null;
    sourceAddressIsPartial: boolean | null;
    serviceAreaIds: number[];
}

export interface ProductLocationFields {
    sourcePincode: string | null;
    sourceCity: string | null;
    sourceCityId: number | null;
    sourceAddressIsPartial: boolean | null;
    sourceServiceAreaId: number | null;
    sourceFulfillmentCenterId: number | null;
    locationContextStatus: 'source_assigned' | 'product_context_only' | 'unavailable';
    deliveryLocationVerified: false;
}

function object(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
}

export function positiveId(value: unknown): number | null {
    const number = typeof value === 'number' ? value
        : typeof value === 'string' && /^\d{1,10}$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(number) && number > 0 && number <= 2_147_483_647 ? number : null;
}

/** Retain only public storefront metadata; address IDs/text, contacts and coordinates are discarded. */
export function sourceContextFromHeader(payload: unknown): SourceLocationContext | null {
    const header = object(payload);
    if (!header || !Array.isArray(header.addresses) || header.addresses.length > 100) return null;
    const selectedId = header.selected_address_id;
    if ((typeof selectedId !== 'string' && typeof selectedId !== 'number') || String(selectedId).length > 100) return null;
    const matches = header.addresses.map(object).filter(address => address && String(address.id) === String(selectedId));
    if (matches.length !== 1) return null;
    const selected = matches[0]!;
    const pin = typeof selected.pin === 'string' || typeof selected.pin === 'number' ? String(selected.pin) : '';
    if (!/^[1-9]\d{5}$/.test(pin)) return null;
    const areas = Array.isArray(header.sa_list) ? header.sa_list.slice(0, 500) : [];
    const serviceAreaIds: number[] = [];
    for (const value of areas) {
        const area = object(value);
        const id = positiveId(area?.sa_id);
        if (id) serviceAreaIds.push(id);
        if (Array.isArray(area?.associated_sa_list)) {
            for (const associated of area.associated_sa_list.slice(0, 500)) {
                const associatedId = positiveId(object(associated)?.sa_id ?? associated);
                if (associatedId) serviceAreaIds.push(associatedId);
            }
        }
    }
    const rawCity = typeof selected.city_name === 'string' ? selected.city_name : '';
    const city = rawCity.replace(/[\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
    return {
        sourcePincode: pin,
        sourceCity: city || null,
        sourceCityId: positiveId(selected.city_id),
        sourceAddressIsPartial: typeof selected.is_partial === 'boolean' ? selected.is_partial : null,
        serviceAreaIds: [...new Set(serviceAreaIds)].sort((a, b) => a - b),
    };
}

export class LocationContextError extends Error {
    constructor(message: string) { super(message); this.name = 'LocationContextError'; }
}

/** This is a guard on source-reported context, never a location selector or fulfillment guarantee. */
export function assertExpectedPincode(expected: string | null | undefined, context: SourceLocationContext | null): void {
    if (!expected) return;
    if (!context) throw new LocationContextError('BigBasket did not expose an unambiguous source pincode. No products were saved for this request. expectedPincode checks context; it does not select a delivery location.');
    if (context.sourcePincode !== expected) {
        throw new LocationContextError(`BigBasket reported source pincode ${context.sourcePincode}, not expected ${expected}. expectedPincode does not select a delivery location.`);
    }
}

export function bindProductContext(visibility: unknown, context: SourceLocationContext | null): ProductLocationFields {
    const value = object(visibility);
    const sa = positiveId(value?.sa_id);
    const fc = positiveId(value?.fc_id);
    const linked = !!context && !!sa && !!fc && context.serviceAreaIds.includes(sa);
    return {
        sourcePincode: linked ? context!.sourcePincode : null,
        sourceCity: linked ? context!.sourceCity : null,
        sourceCityId: linked ? context!.sourceCityId : null,
        sourceAddressIsPartial: linked ? context!.sourceAddressIsPartial : null,
        sourceServiceAreaId: sa,
        sourceFulfillmentCenterId: fc,
        locationContextStatus: linked ? 'source_assigned' : sa || fc ? 'product_context_only' : 'unavailable',
        deliveryLocationVerified: false,
    };
}
