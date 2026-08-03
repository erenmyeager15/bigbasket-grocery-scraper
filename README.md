# BigBasket Grocery Scraper: Prices & Stock

Scrape public BigBasket grocery listing pages and export clean product rows from the Apify Dataset in JSON, CSV, Excel, XML, HTML, RSS, or JSONL. The Actor is built for grocery price monitoring, FMCG catalog research, assortment checks, and simple ecommerce reporting.

It collects public product details such as title, brand, pack size, price, MRP, discount percentage, rating, rating count, stock status, category, image URL, product URL, and scrape timestamp. It does not require a BigBasket login or API key, and it does not collect private customer, account, seller, or contact data.

The default run is intentionally small: one in-stock `milk` result with one result page and Apify Residential proxy in India.

## What you get

- Search query or category URL source
- Product position in the listing response
- BigBasket product ID
- Product title, brand, and pack size
- Current price, MRP, discount percentage, and currency
- Category name when visible in the listing payload
- Rating and rating count when available
- Stock status
- Product URL and image URL
- Timestamp for each saved row

## Common uses

1. Monitor grocery and FMCG prices, MRP, discounts, and availability.
2. Compare pack sizes and brand pricing across grocery keywords.
3. Build small category snapshots for reports or dashboards.
4. Track assortment changes for key BigBasket category pages.
5. Enrich internal catalog rows with public marketplace listing metadata.

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

This example tracks up to five in-stock Amul milk listings:

```json
{
  "keywords": ["milk"],
  "categoryUrls": [],
  "brands": ["Amul"],
  "inStockOnly": true,
  "maxResults": 5,
  "maxPagesPerSource": 1,
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
4. Compare rows between runs using `productId` or `productUrl` as the product key.
5. Track `price`, `mrp`, `discountPercent`, `inStock`, and `scrapedAt` for changes.
6. Export each run or connect a webhook/API workflow for downstream storage and alerts.

The Actor returns a current public-listing snapshot. It does not maintain price history,
match products across different stores, or send change alerts by itself. Store snapshots
in your own table or workflow before calculating changes. Availability and prices are
regional, so keep the same proxy country and delivery context when comparing runs.

For cost control, begin with one keyword, one page, five or fewer results, and a daily
schedule. Avoid duplicate schedules and aggressive polling.

## Need Cross-Store Price Comparison?

This Actor is designed for BigBasket-only catalog and price snapshots. To compare a product across BigBasket, Blinkit, Myntra, Meesho, and other supported India ecommerce sources, use the [India E-commerce Price Tracker](https://apify.com/fascinating_lentil/india-ecommerce-price-tracker).

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
| `proxyConfiguration` | object | Residential India | Apify proxy settings. Residential India proxy is recommended for regional prices and availability. |

## Output

A saved dataset row looks like this:

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
  "category": "Bakery, Cakes & Dairy",
  "rating": 3.7,
  "ratingCount": 18036,
  "inStock": true,
  "productUrl": "https://www.bigbasket.com/pd/40147597/heritage-daily-health-toned-milk-500-ml-pouch/",
  "imageUrl": "https://www.bbassets.com/media/uploads/p/l/40147597_9-heritage-daily-health-toned-milk.jpg",
  "scrapedAt": "2026-06-30T10:00:00.000Z"
}
```

Optional fields may be `null` or `N/A` when BigBasket does not expose them in the listing response.

## Pricing

This Actor uses Apify Pay Per Event pricing.

| Event | Price |
| --- | ---: |
| `product-scraped` | `$0.002` per saved product row |
| `apify-actor-start` | `$0.00005` per GB when the Actor starts |

Products are charged only when a clean product record is saved to the dataset. The Actor uses atomic dataset charging, so the run stops before saving unpaid records after the user's maximum charge is reached.

Platform usage, such as compute and proxy traffic, may also be charged by Apify depending on the run configuration. Residential India proxy is recommended for BigBasket reliability and regional pricing, but it can increase platform usage cost.

## Cost control

- Start with one keyword and `maxResults: 1`.
- Keep `maxPagesPerSource: 1` for the first test.
- Keep `inStockOnly` enabled unless you need unavailable products.
- Add more keywords, brands, or category pages only after checking the output.
- Use the run's maximum cost setting if you want a strict spending cap.

## Reliability

BigBasket prices and availability vary by region and can change frequently. The Actor includes:

- Anonymous storefront cookie initialization before listing API requests
- India residential proxy defaults
- Retries for transient request failures
- Deduplication by product ID, URL, or title
- Invalid category URL skipping when at least one valid source remains
- A zero-result failure guard so blocked or empty runs do not look successful
- Field-level fallbacks when optional listing data is unavailable

## Limits

- This Actor reads public listing data, not private account or order data.
- Some product cards do not expose ratings, discounts, stock flags, images, or MRP.
- Brand and category values come from BigBasket's listing payload and may need downstream cleaning for strict catalog workflows.
- This Actor is not an official BigBasket API and is not affiliated with BigBasket.

## Responsible use

Use this Actor for lawful research, price monitoring, and analysis of publicly available information. You are responsible for complying with BigBasket's terms, robots.txt, privacy laws, India's DPDP Act where applicable, and all local regulations.

Do not use this Actor to collect, infer, sell, or misuse personal data. The Actor author is not responsible for misuse by end users.

## Feedback

If this Actor is useful in your workflow, consider leaving an honest review. Feedback helps guide reliability improvements.

### Request a field or filter

Need another public product field, filter, or output format? Open an Issue on this
Actor and describe the result you need. Do not include account credentials, order
data, customer information, or other personal data. Additional sources are considered
only when their permission and data rights can be verified.

## License

Apache-2.0. See `LICENSE`.
