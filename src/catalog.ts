export interface PackFacts {
    normalizedPackSize: string | null;
    packIdentity: string | null;
    packNormalizationStatus: 'parsed' | 'unrecognized';
    packCount: number | null;
    totalQuantity: number | null;
    quantityUnit: 'g' | 'ml' | 'piece' | null;
    unitPrice: number | null;
    unitPriceBasis: '100 g' | '1 L' | '1 piece' | null;
}

/** Parse only explicit, bounded pack labels. Never guess quantities from titles or unit prices. */
export function packFacts(packSize: string, price: number | null): PackFacts {
    const unknown: PackFacts = {
        normalizedPackSize: null,
        packIdentity: null,
        packNormalizationStatus: 'unrecognized',
        packCount: null,
        totalQuantity: null,
        quantityUnit: null,
        unitPrice: null,
        unitPriceBasis: null,
    };
    let label = packSize.toLowerCase().replace(/[×*]/g, 'x').replace(/\s+/g, ' ').trim();
    let count = 1;
    const suffix = label.match(/^(.*?)\s*[-,]?\s*\(?pack of (\d+)\)?$/);
    if (suffix) {
        label = suffix[1].trim();
        count = Number(suffix[2]);
    }
    const prefix = label.match(/^(?:pack of )?(\d+)\s*x\s*(.+)$/);
    if (prefix) {
        if (count !== 1) return unknown;
        count = Number(prefix[1]);
        label = prefix[2];
    }
    const amount = label.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(kg|kilograms?|g|gm|gms|grams?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|pcs?|pieces?|nos?)$/);
    if (!amount || !Number.isInteger(count) || count < 1 || count > 100) return unknown;
    const value = Number(amount[1]);
    if (!Number.isFinite(value) || value <= 0) return unknown;
    const rawUnit = amount[2];
    const unit = /^(?:kg|kilogram|g|gm|gram)/.test(rawUnit) ? 'g'
        : /^(?:ml|millilit|l|lit)/.test(rawUnit) ? 'ml' : 'piece';
    const multiplier = /^(?:kg|kilogram|l$|lit)/.test(rawUnit) ? 1000 : 1;
    const each = value * multiplier;
    const total = Number((each * count).toFixed(6));
    if (total <= 0 || total > 1_000_000 || (unit === 'piece' && !Number.isInteger(each))) return unknown;
    const basis = unit === 'g' ? '100 g' : unit === 'ml' ? '1 L' : '1 piece';
    const basisQuantity = unit === 'g' ? 100 : unit === 'ml' ? 1000 : 1;
    return {
        normalizedPackSize: `${count} x ${Number(each.toFixed(6))} ${unit}`,
        packIdentity: `${count}x${Number(each.toFixed(6))}${unit}`,
        packNormalizationStatus: 'parsed',
        packCount: count,
        totalQuantity: total,
        quantityUnit: unit,
        unitPrice: price !== null && Number.isFinite(price) && price >= 0
            ? Number(((price / total) * basisQuantity).toFixed(4)) : null,
        unitPriceBasis: basis,
    };
}
