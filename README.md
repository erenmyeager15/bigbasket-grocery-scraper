# BigBasket Grocery Scraper: Prices & Stock

Scrape public BigBasket grocery listings with normalized pack quantities, comparable unit prices, source-context provenance, and optional price and stock monitoring. Export product rows from the Apify Dataset in JSON, CSV, Excel, XML, HTML, RSS, or JSONL. Tracking retains a bounded observation history and exposes thresholded alerts for downstream workflows.

It collects public product details such as title, brand, pack size, price, MRP, discount percentage, rating, rating count, stock status, category, image URL, product URL, and scrape timestamp. It does not require a BigBasket login or API key, and it does not collect private customer, account, seller, or contact data.

The default run is intentionally small: one in-stock `milk` result with one result page and Apify Residential proxy in India.

## What you get

- Search query or category URL source
- Product position in the listing response
- BigBasket product ID
- Product title, brand, and pack size
- Normalized pack quantity and unit price when the pack label is explicit
- Current price, MRP, discount percentage, and currency
- Category name when visible in the listing payload
- Rating and rating count when available
- Stock status
- Optional previous price, price change, price-change percentage, and stock-change fields
- All observed changes in `changeTypes`, with `changeType` retained for compatibility
- Change labels: `new`, `unchanged`, `baseline_reset`, `price_drop`, `price_increase`, `back_in_stock`, or `out_of_stock`
- Source-reported pincode/city and the product's service-area and fulfillment-center IDs
- Optional bounded `priceHistory`, `alertTriggered`, and `alertReasons`
- A machine-readable `MONITORING-SUMMARY` JSON record and saved-row alerts
- Product URL and image URL
- Timestamp for each saved row

## See real sample results

Before running the Actor, inspect this [25-product JSON sample](https://raw.githubusercontent.com/erenmyeager15/bigbasket-grocery-scraper/main/examples/bigbasket-milk-sample-2026-09-30.json). It contains actual public product rows from an owner-run `milk` search on **30 September 2026**, using build `1.0.23`. The run saved 25 rows in about 20 seconds, and all 25 explicit pack labels normalized. This is a dated test snapshot, not current prices, customer usage, or a complete market catalog.

The first three rows were observed at **10:33 IST**:

| Product | Original pack | Normalized pack | Price (INR) | Unit price (INR / 1 L) | Observed stock |
| --- | --- | --- | ---: | ---: | --- |
| Heritage Daily Health Toned Milk | 500 ml | 1 x 500 ml | 33 | 66 | In stock |
| Amul Gold Full Cream Milk | 500 ml | 1 x 500 ml | 32 | 64 | In stock |
| Nandini Samrudhi Milk | 500 ml | 1 x 500 ml | 28 | 56 | In stock |

These are different milk products, not matched substitutes. The same unit-price basis makes pack quantities easier to inspect without claiming the products are equivalent. All 25 rows initialized tracking baselines (`changeType: "new"`, `historyCount: 1`); this batch detected no price/stock changes and triggered no alerts. A separate one-product repeat test retained two observations and reported no change—it was not a repeat of the entire 25-row batch.

The sample preserves the reported anonymous source context, including pincode `560004`, service area `19224`, fulfillment center `1820`, and `sourceAddressIsPartial: true`. `deliveryLocationVerified` remains `false`: these fields do not select a delivery postcode or establish fulfillment eligibility. The expected-pincode guard was not enabled in this batch. The public download omits the owner's internal `trackingRegion` label; it contains no run input, cookies, headers, private tracking-store records, or customer data.

## Common uses

1. Monitor grocery and FMCG prices, MRP, discounts, and availability.
2. Compare pack sizes and brand pricing across grocery keywords.
3. Build small category snapshots for reports or dashboards.
4. Track assortment changes for key BigBasket category pages.
5. Enrich internal catalog rows with public marketplace listing metadata.

## Ready-to-run workflows

Use these public task pages when you want a prepared input instead of configuring a run from scratch:

- [Monitor BigBasket prices and stock](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/monitor-bigbasket-prices-and-stock)
- [Collect BigBasket prices, MRP and discounts](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/collect-bigbasket-prices-mrp-discounts)
- [Export a BigBasket category catalog](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/export-bigbasket-category-catalog)

For the complete scheduled-run, Google Sheets, and webhook setup, see the [BigBasket Price Watch Kit](BIGBASKET-PRICE-WATCH-KIT.md). A short recording outline is available in the [demo script](VIDEO-DEMO-SCRIPT.md).

## Quick start

Use this input for a low-cost first run:

```json
{
  "keywords": ["milk"],
  "categoryUrls": [],
  "brands": [],
  "inStockOnly": true,
  "maxResults": 1,
  "maxPagesPerSource": 1,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "IN"
  }
}
```

After the run finishes, open the dataset and export the `Products` view.

## Schedule Price And Stock Monitoring

Use an Apify Task and Schedule when you need recurring BigBasket price or availability
snapshots. Start with a daily schedule; use a higher frequency only when the business
need justifies the additional requests and cost.

This example tracks up to five Amul milk listings. The named key-value store retains a baseline and up to 20 observations per comparable product context:

```json
{
  "keywords": ["milk"],
  "categoryUrls": [],
  "brands": ["Amul"],
  "inStockOnly": false,
  "maxResults": 5,
  "maxPagesPerSource": 1,
  "trackChanges": true,
  "trackingStoreName": "bigbasket-milk-watch",
  "trackingRegion": "milk-watch",
  "historyLimit": 20,
  "includeHistory": false,
  "priceChangeThresholdPercent": 5,
  "priceChangeThresholdAbsolute": 2,
  "alertOnStockChanges": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "IN"
  }
}
```

1. Run the input once and confirm the returned products are relevant.
2. Select **Save as a new task** on the Actor page.
3. Open **Schedules**, create a daily schedule, and select the saved task.
4. The first run marks each product as `new` and establishes the baseline.
5. Later comparable runs populate `previousPrice`, `priceChange`, `priceChangePercent`, `previousInStock`, `stockChanged`, and `changeTypes`.
6. Filter `alertTriggered: true`, or consume the saved-row alert output in a webhook/API workflow. `changeDetected` also includes changes below your alert thresholds.

The tracking store keeps the latest snapshot plus a bounded history, defaulting to 20 and configurable from 1 to 90 observations. Export each successful run for a complete time series. History keys include the observed source context and `trackingRegion`; that label does not set a location. A new source or pack context creates a baseline without an alert, and old product-only history is not migrated into the scoped keys. Missing header linkage or product service-area/fulfillment-center IDs suppresses comparison. The Actor does not match products across stores or send outbound messages.

Price alerts require both configured thresholds: the absolute INR change and the absolute percentage change must meet their respective minimums. Zero disables a threshold. Observed stock changes can trigger independently when `alertOnStockChanges` is enabled. The first observation and baseline resets do not alert. Use `inStockOnly: false` for stock monitoring; a missing listing row is never inferred to be out of stock. Keep one schedule per store/context and prevent overlapping runs: concurrent snapshot writers are not supported.

For cost control, begin with one keyword, one page, five or fewer results, and a daily
schedule. Avoid duplicate schedules and aggressive polling.

## Need Cross-Store Price Comparison?

This Actor is designed for BigBasket-only catalog and price snapshots. The [India E-commerce Price Tracker](https://apify.com/fascinating_lentil/india-ecommerce-price-tracker) currently supports Flipkart, Myntra, BigBasket, and Meesho. Blinkit, JioMart, and AliExpress adapters are parked and are not supported comparison sources.

For reliable comparison, use the same city or delivery area across sources and keep product-match confidence visible when titles or variants differ.

## Input

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `keywords` | array | `["milk"]` | One to five grocery search terms. Leave empty only when using category URLs. |
| `categoryUrls` | array | `[]` | Optional BigBasket listing URLs under `/pc/`, `/pb/`, or `/cl/`. Invalid category URLs are skipped when other sources are valid. |
| `brands` | array | `[]` | Optional exact brand filters. Matching is case-insensitive. |
| `inStockOnly` | boolean | `true` | Save only products that BigBasket marks available for sale. |
| `maxResults` | integer | `1` | Maximum unique products saved across the run. Range: 1-1000. |
| `maxPagesPerSource` | integer | `1` | Maximum pages requested for each keyword or category URL. Range: 1-25. |
| `trackChanges` | boolean | `false` | Compare each result with the previous product state stored across runs. |
| `trackingStoreName` | string | `bigbasket-price-history` | Named persistent store used for tracking. Use one name per delivery region/workflow. |
| `trackingRegion` | string | `unspecified` | Stable monitoring label, 1-63 letters, numbers, `_` or `-`; normalized to lowercase. Isolates history without selecting location. |
| `expectedPincode` | string | unset | Optional six-digit guard against the source-reported anonymous pincode. Fails when missing or mismatched; does not select location. |
| `historyLimit` | integer | `20` | Retain the latest 1-90 comparable saved observations per product. |
| `includeHistory` | boolean | `false` | Include `priceHistory` in tracked dataset rows; snapshots retain history regardless. |
| `priceChangeThresholdPercent` | number | `0` | Minimum absolute percentage price change for an alert, 0-1000. |
| `priceChangeThresholdAbsolute` | number | `0` | Minimum absolute INR price change for an alert, 0-1000000. |
| `alertOnStockChanges` | boolean | `true` | Alert on an observed available/unavailable transition. |
| `proxyConfiguration` | object | Residential India | Request proxy settings. An India proxy does not select or verify a delivery area. |

## Source context and pincode guard

`sourcePincode`, `sourceCity`, `sourceCityId`, and `sourceAddressIsPartial` describe BigBasket's matched, source-assigned anonymous storefront context. `sourceServiceAreaId` and `sourceFulfillmentCenterId` come from each product's listing payload. `locationContextStatus` is `source_assigned` when the product can be linked to the header, `product_context_only` when only product context is available, or `unavailable`. The Actor discards address IDs, address text, contacts, and coordinates.

`deliveryLocationVerified` is always `false`. Anonymous defaults can be partial, and the active product service area can differ from the service area associated with the request's entry context. `expectedPincode` checks the reported source pincode and fails closed when it is missing or different. It does not select a delivery pincode, verify physical delivery location, or establish fulfillment eligibility. The public anonymous location selector currently opens an OTP sign-in dialog; explicit delivery-location selection remains unsupported.

For example, after inspecting a run's reported context, add `"expectedPincode": "560004"` only if that is the source pincode your workflow expects. Neither `trackingRegion` nor proxy country is evidence that a location was selected.

## Pack normalization

Explicit labels such as `500 ml`, `1 kg`, `2 x 500 g`, `500 ml - Pack of 2`, and `6 pcs` produce `normalizedPackSize`, `packIdentity`, `packCount`, `totalQuantity`, and `quantityUnit`. Unit prices use INR per `100 g`, `1 L`, or `1 piece`. For example, a 500 ml pack priced at INR 32 has `unitPrice: 64` and `unitPriceBasis: "1 L"`.

Ambiguous labels, approximate ranges, and labels containing non-quantity details remain `packNormalizationStatus: "unrecognized"` with null normalized quantities and unit prices. The original `packSize` is preserved. Quantities are never guessed from product titles or a displayed base price, and pack changes reset the monitoring baseline.

## Output

The following is a **synthetic schema illustration**, not the verified owner-run sample above. Its price drop is an example of the field structure, not an observed event from that test:

```json
{
  "source": "bigbasket",
  "searchQuery": "milk",
  "position": 1,
  "productId": "40147597",
  "title": "Daily Health Toned Milk",
  "brand": "Heritage",
  "price": 32,
  "mrp": null,
  "discountPercent": null,
  "currency": "INR",
  "packSize": "500 ml",
  "normalizedPackSize": "1 x 500 ml",
  "packIdentity": "1x500ml",
  "packNormalizationStatus": "parsed",
  "packCount": 1,
  "totalQuantity": 500,
  "quantityUnit": "ml",
  "unitPrice": 64,
  "unitPriceBasis": "1 L",
  "sourcePincode": "560004",
  "sourceCity": "Bangalore",
  "sourceCityId": 1,
  "sourceAddressIsPartial": true,
  "sourceServiceAreaId": 19224,
  "sourceFulfillmentCenterId": 1820,
  "locationContextStatus": "source_assigned",
  "deliveryLocationVerified": false,
  "category": "Bakery, Cakes & Dairy",
  "rating": 3.7,
  "ratingCount": 18036,
  "inStock": true,
  "trackingEnabled": true,
  "changeDetected": true,
  "changeType": "price_drop",
  "changeTypes": ["price_drop"],
  "alertTriggered": true,
  "alertReasons": ["price_drop"],
  "comparisonSkippedReason": null,
  "historyCount": 2,
  "trackingRegion": "milk-watch",
  "previousPrice": 35,
  "priceChange": -3,
  "priceChangePercent": -8.57,
  "previousInStock": true,
  "stockChanged": false,
  "firstSeenAt": "2026-06-29T10:00:00.000Z",
  "previousScrapedAt": "2026-06-29T10:00:00.000Z",
  "productUrl": "https://www.bigbasket.com/pd/40147597/heritage-daily-health-toned-milk-500-ml-pouch/",
  "imageUrl": "https://www.bbassets.com/media/uploads/p/l/40147597_9-heritage-daily-health-toned-milk.jpg",
  "scrapedAt": "2026-06-30T10:00:00.000Z"
}
```

This is an illustrative observation, not a price or delivery promise. Optional fields may be `null` or `N/A` when BigBasket does not expose them. Tracking fields appear only with `trackChanges: true`; `priceHistory` additionally requires `includeHistory: true`. The run's default key-value store exposes `MONITORING-SUMMARY` JSON and an `ALERTS` JSON array. Alert copies omit history and are generated only for product rows successfully saved through the charged dataset operation, not for unpaid candidates.

The summary includes saved/tracked counts, new baselines, baseline resets, observed changes, price/stock-change counts, alert counts, unverified-context counts, and snapshot-persistence failures. `collectionStatus` distinguishes `running`, `interrupted`, `bounded_window`, `partial`, `budget_limited`, and `location_guard_failed`; even `bounded_window` describes a limited listing sample, not a complete market snapshot. The summary explicitly reports `locationSelectionSupported: false` and `deliveryLocationVerified: false`.

With tracking enabled, each completed page checkpoints `ALERTS` and then `MONITORING-SUMMARY` with `collectionStatus: "running"` before advancing that page's saved-row baselines. Unexpected errors attempt an `interrupted` checkpoint; pincode-guard failures use `location_guard_failed`. A failed artifact checkpoint leaves its pending baseline writes uncommitted. Hard termination can occur between these steps: the Dataset remains the recovery source, and an uncommitted baseline can cause an alert to repeat on the next run. These writes are not an exactly-once transaction across storages. Deduplicate downstream alerts by product, source context, and observation timestamp.

## Pricing

The repository's bundled configuration currently uses Apify Pay Per Event pricing:

| Event | Price |
| --- | ---: |
| `product-scraped` | `$0.002` per saved product row |
| `apify-actor-start` | `$0.00005` per GB when the Actor starts |

Products are charged only when a clean product record is saved to the dataset. The Actor uses atomic dataset charging, so the run stops before saving unpaid records after the user's maximum charge is reached.

Pack normalization, context metadata, history, and alert fields are bundled into the existing saved-product event; there is no separate history or alert event in this configuration. Check the Actor's live pricing page before running, because published pricing may differ from a local checkout.

Platform usage, such as compute and proxy traffic, may also be charged by Apify depending on the run configuration. Residential India proxy is recommended for BigBasket reliability and regional pricing, but it can increase platform usage cost.

## Cost control

- Start with one keyword and `maxResults: 1`.
- Keep `maxPagesPerSource: 1` for the first test.
- Keep `inStockOnly` enabled for small catalog tests; disable it when monitoring stock transitions.
- Add more keywords, brands, or category pages only after checking the output.
- Use the run's maximum cost setting if you want a strict spending cap.

## Reliability

BigBasket prices and availability vary by region and can change frequently. The Actor includes:

- Anonymous storefront cookie initialization before listing API requests
- India residential proxy defaults
- Retries for transient request failures
- Deduplication by product ID, URL, or title
- Invalid category URL skipping when at least one valid source remains
- A failure guard when all source requests fail
- Field-level fallbacks when optional listing data is unavailable
- Persistent snapshots and bounded history scoped to the observed source context and monitoring label
- Pack/context baseline resets and suppression of unlinked or stale comparisons
- Thresholded machine-readable alerts and a run summary for scheduled workflows

## Limits

- This Actor reads public listing data, not private account or order data.
- Some product cards do not expose ratings, discounts, stock flags, images, or MRP.
- Missing or unknown availability is `inStock: null`; only an explicit source unavailable signal is recorded as `false`.
- Brand and category values come from BigBasket's listing payload and may need downstream cleaning for strict catalog workflows.
- Built-in history retains a bounded sample of saved rows, not every market observation or an exhaustive assortment.
- A missing product, truncated result page, filter, failed source, or spending limit does not establish that a product is out of stock.
- Explicit pincode selection and verified fulfillment are unsupported; use source-context provenance and the optional expected-pincode guard.
- Keep one schedule per tracking store/context and prevent overlapping runs; concurrent writers are not supported.
- Page checkpoints reduce lost monitoring output, but abrupt termination can leave artifacts incomplete and alerts may repeat. Recover saved observations from the Dataset.
- This Actor is not an official BigBasket API and is not affiliated with BigBasket.

## Responsible use

Use this Actor for lawful research, price monitoring, and analysis of publicly available information. You are responsible for complying with BigBasket's terms, robots.txt, privacy laws, India's DPDP Act where applicable, and all local regulations.

Do not use this Actor to collect, infer, sell, or misuse personal data. The Actor author is not responsible for misuse by end users.

## Feedback

If this Actor is useful in your workflow, consider leaving an honest review. Feedback helps guide reliability improvements.

## License

Apache-2.0. See `LICENSE`.
