# BigBasket Price Watch Kit

Use this kit to turn BigBasket listings into a repeatable price, stock, and catalog workflow. The Actor retains a context-scoped baseline and a bounded observation history, normalizes explicit pack labels, and exposes thresholded alerts. Export successful runs to your own table when you need a complete time series.

## Ready-to-run tasks

1. [Monitor BigBasket prices and stock](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/monitor-bigbasket-prices-and-stock)
2. [Collect BigBasket prices, MRP and discounts](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/collect-bigbasket-prices-mrp-discounts)
3. [Export a BigBasket category catalog](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/export-bigbasket-category-catalog)

These public task links remain useful starting points. The local release examples include the newer monitoring fields; existing published tasks may need those fields added. Start small and confirm the returned products and source context before scheduling.

## Daily monitoring workflow

1. Create a task from the price-and-stock example.
2. Keep one page per source and a small result limit while validating it.
3. Create an Apify Schedule and run the task once per day.
4. Enable `trackChanges`, set `inStockOnly: false`, and choose a stable `trackingStoreName` and `trackingRegion` label.
5. Keep `historyLimit: 20` initially; choose 1-90 observations if needed. Set `includeHistory: true` when you want that array exported in product rows.
6. Inspect `sourcePincode`, `sourceCity`, `sourceServiceAreaId`, `sourceFulfillmentCenterId`, and `locationContextStatus`. Optionally set `expectedPincode` to fail closed on a missing or different source pincode.
7. Set `priceChangeThresholdPercent` and `priceChangeThresholdAbsolute`. Both price thresholds must pass; zero disables that threshold. Stock alerts can trigger independently through `alertOnStockChanges`.
8. The first run creates a baseline. Later comparable runs expose all observed transitions in `changeTypes`; forward only rows with `alertTriggered: true` to notification tools.
9. Read the run's `MONITORING-SUMMARY` JSON and saved-row alerts. Store every successful run externally if you need a complete historical series.

`expectedPincode` checks the anonymous storefront's reported source pincode. It does not select a delivery location or verify fulfillment, and `deliveryLocationVerified` remains false. The anonymous public selector currently opens an OTP sign-in dialog, so explicit location selection is unsupported. `trackingRegion` is an isolation label, not a delivery selector; an India proxy does not establish a city or pincode.

Source or pack changes create a new baseline without an alert. Old product-only snapshot keys are not migrated. Missing header/product linkage suppresses comparisons, and stale observations do not replace newer snapshots. A product absent from a limited or filtered listing is not inferred to be out of stock. Use one schedule per tracking store/context and prevent overlapping runs; concurrent writers are unsupported.

Tracking checkpoints saved-row `ALERTS` and `MONITORING-SUMMARY` after each completed page before advancing its baselines. `running` means a page checkpoint is available but collection has not finished. Final states are `bounded_window`, `partial`, `budget_limited`, or `location_guard_failed`; unexpected errors attempt `interrupted`. Failed publication leaves pending baselines uncommitted. Hard termination can prevent a checkpoint, so recover saved rows from the Dataset and deduplicate alerts by product/context/timestamp: alerts can repeat on the next run. The output and snapshot stores do not provide an exactly-once transaction.

Missing or unknown availability produces `inStock: null` and cannot establish a stock transition. Only an explicit source unavailable signal produces `false`.

## Send successful runs to Google Sheets

Use Make, n8n, Zapier, or another workflow tool:

1. Add an Apify webhook for the `ACTOR.RUN.SUCCEEDED` event on the saved task.
2. Read `resource.defaultDatasetId` from the webhook payload.
3. Fetch the clean rows from:

   ```text
   https://api.apify.com/v2/datasets/DATASET_ID/items?clean=true&format=json
   ```

4. Add or update rows using `productId` plus the observed source pincode, city, service-area/fulfillment-center IDs, and monitoring label as the context key. Keep `packIdentity` visible so variant changes are not mixed.
5. Keep a separate observation row for each `scrapedAt` value if you need history.
6. Forward `alertTriggered: true` rows or the saved-row alert output to your notification tool. `changeDetected` includes below-threshold changes and is not the alert filter.

Store the Apify API token in the workflow platform's secret manager. Never put it in a public task, sheet, README, webhook URL, or screenshot.

## Suggested Google Sheets columns

```text
productId, title, brand, packSize, normalizedPackSize, packIdentity, unitPrice,
unitPriceBasis, price, previousPrice, priceChange, priceChangePercent, changeTypes,
changeDetected, alertTriggered, alertReasons, comparisonSkippedReason, historyCount,
mrp, discountPercent, inStock, previousInStock, stockChanged, sourcePincode,
sourceCity, sourceCityId, sourceAddressIsPartial, sourceServiceAreaId,
sourceFulfillmentCenterId, locationContextStatus, deliveryLocationVerified,
trackingRegion, category, productUrl, searchQuery, scrapedAt
```

For a change log, add:

```text
firstSeenAt, previousScrapedAt, observedAt
```

## Cost controls

- Begin with one keyword, one page, and 1-5 results.
- Run daily before considering a higher frequency.
- Keep one non-overlapping schedule per tracking store/context and remove duplicate schedules.
- Use the run maximum-cost setting for a hard cap.
- Increase category pages and result limits only after checking the first export.

## Scope

This kit monitors public BigBasket listings. Its store retains a latest snapshot and the most recent 1-90 saved observations per comparable product context, defaulting to 20. This is not a complete market history or assortment census. Explicit pack quantities yield INR per 100 g, 1 L, or 1 piece; ambiguous labels keep null normalized values. Alert copies cover successfully saved charged rows only. History and alert fields use the existing bundled product-scraped event; no new billing event is introduced.

The kit does not provide customer or order data, delivery-location selection, verified fulfillment, cross-store matching, automatic repricing, or outbound notifications. Review source terms and applicable law before using the workflow.
