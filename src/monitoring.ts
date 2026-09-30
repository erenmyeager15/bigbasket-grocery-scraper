import type { TrackedProductRecord } from './types.js';

export function monitoringArtifacts(
    records: TrackedProductRecord[],
    details: {
        savedCount: number;
        trackingEnabled: boolean;
        trackingStoreId: string | null;
        collectionStatus: 'running' | 'interrupted' | 'bounded_window' | 'partial' | 'budget_limited' | 'location_guard_failed';
        successfulPageCount: number;
        trackingPersistenceFailures: number;
        expectedPincode: string | null;
    },
) {
    const alerts = records.filter(record => record.alertTriggered).map(({ priceHistory: _history, ...record }) => record);
    return {
        alerts,
        summary: {
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            ...details,
            locationSelectionSupported: false,
            deliveryLocationVerified: false,
            monitoringNote: 'Source-reported anonymous context only; no delivery fulfillment guarantee. Missing products are not inferred to be out of stock.',
            trackedCount: records.length,
            initializedCount: records.filter(record => record.changeType === 'new').length,
            baselineResetCount: records.filter(record => record.changeType === 'baseline_reset').length,
            changedCount: records.filter(record => record.changeDetected).length,
            alertCount: alerts.length,
            unverifiedContextCount: records.filter(record => record.locationContextStatus !== 'source_assigned').length,
            trackingPersistenceFailures: details.trackingPersistenceFailures,
            priceDropCount: records.filter(record => record.changeTypes.includes('price_drop')).length,
            priceIncreaseCount: records.filter(record => record.changeTypes.includes('price_increase')).length,
            stockChangeCount: records.filter(record => record.stockChanged).length,
        },
    };
}
