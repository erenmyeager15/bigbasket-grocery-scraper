# BigBasket Grocery Scraper - Products & Prices

Collect public BigBasket grocery and household product catalog data by search keyword or category URL. The Actor returns clean, structured records containing product titles, brands, pack sizes, prices, MRP, discounts, ratings, availability, categories, image URLs, and canonical product URLs.

The scraper uses BigBasket's public storefront listing service and initializes the anonymous regional cookies used by the website. India residential proxies are recommended because product availability and prices can vary by service area.

For a low-cost first run, use the default sample input: `milk`, in-stock only, 10 products, and 1 page per source.

## Features

- Search multiple grocery keywords in one run
- Scrape supported BigBasket category and brand URLs
- Process up to 1,000 unique products, with small defaults for safe testing
- Filter by exact brand name or in-stock availability
- Deduplicate products globally by product ID
- Export JSON, CSV, Excel, XML, RSS, or JSONL through Apify Dataset
- Save and charge each real product atomically, then stop at the user's spending limit

## How to Scrape BigBasket Products

1. Add one or more search keywords, category URLs, or both.
2. Choose the maximum result and page limits.
3. Optionally add brand filters or enable in-stock-only mode.
4. Run the Actor and export the Products dataset view.

## Input

```json
{
  "keywords": ["milk"],
  "categoryUrls": [],
  "brands": [],
  "inStockOnly": true,
  "maxResults": 10,
  "maxPagesPerSource": 1,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "IN"
  }
}
```

## Output

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
  "scrapedAt": "2026-06-13T08:00:00.000Z"
}
```

## Use Cases

- Grocery and FMCG price monitoring
- Retail catalog research
- Brand and pack-size comparison
- Discount and availability tracking
- Assortment and category analysis

## Pricing

| Event | Price | Description |
|---|---:|---|
| `product-scraped` | $0.002 | One clean product saved to the dataset |

Products are charged only when a clean product record is saved. The Actor stops saving more products when the run's maximum charge is reached.

Cost-control tips:

- Start with one keyword, `maxResults: 10`, and `maxPagesPerSource: 1`.
- Keep `inStockOnly` enabled for cleaner, smaller datasets.
- Add category URLs, more keywords, or more pages only after the first run confirms the output fits your use case.
- Use the run's maximum cost setting if you want a strict spending cap.
- India residential proxy traffic is recommended for reliability and regional pricing.

## Data Notes

BigBasket prices and availability are regional and can change frequently. Some products do not expose ratings, discounts, stock flags, images, or MRP; those fields are returned as `null` or `N/A` rather than fabricated.

## Responsible Use

This Actor collects only publicly available, non-personal information. It does not collect personal contact details, account data, or private information.

Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.

## License

Apache-2.0
