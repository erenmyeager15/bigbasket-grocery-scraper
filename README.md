# BigBasket Grocery Scraper - Products & Prices

Collect public BigBasket grocery and household product catalog data by search keyword or category URL. The Actor returns clean, structured records containing product names, brands, pack sizes, current prices, MRP, discounts, ratings, availability, categories, images, and canonical product URLs.

The scraper uses BigBasket's public storefront listing service and initializes the anonymous regional cookies used by the website. India residential proxies are recommended because product availability and prices can vary by service area.

## Features

- Search multiple grocery keywords in one run
- Scrape supported BigBasket category and brand URLs
- Process up to 1,000 unique products
- Filter by exact brand name or in-stock availability
- Deduplicate products globally by product ID
- Export JSON, CSV, Excel, XML, RSS, or JSONL through Apify Dataset
- Charge only after a real product record is saved

## How to Scrape BigBasket Products

1. Add one or more search keywords, category URLs, or both.
2. Choose the maximum result and page limits.
3. Optionally add brand filters or enable in-stock-only mode.
4. Run the Actor and export the Products dataset view.

## Input

```json
{
  "keywords": ["milk", "rice"],
  "categoryUrls": [],
  "brands": ["Amul"],
  "inStockOnly": true,
  "maxResults": 100,
  "maxPagesPerSource": 5,
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
  "sourceType": "keyword",
  "source": "milk",
  "position": 1,
  "productId": "40147597",
  "productName": "Daily Health Toned Milk",
  "brand": "Heritage",
  "packSize": "500 ml",
  "currentPrice": 32,
  "marketPrice": 32,
  "discountPercent": null,
  "savingsAmount": null,
  "currency": "INR",
  "unitPrice": "INR 0.06/ml",
  "rating": 3.7,
  "ratingCount": 18036,
  "reviewCount": 181,
  "soldText": "310K+ SOLD IN 1 MONTH",
  "category": "Bakery, Cakes & Dairy",
  "subcategory": "Fresh Milk",
  "inStock": true,
  "expressDelivery": false,
  "imageUrl": "https://www.bbassets.com/media/uploads/p/l/40147597_9-heritage-daily-health-toned-milk.jpg",
  "productUrl": "https://www.bigbasket.com/pd/40147597/heritage-daily-health-toned-milk-500-ml-pouch/",
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

## Data Notes

BigBasket prices and availability are regional and can change frequently. Some products do not expose ratings, reviews, discounts, sold counts, or express-delivery status; those fields are returned as `null` or `false` rather than fabricated.

## Responsible Use

This Actor collects only publicly available, non-personal information. It does not collect personal contact details, account data, or private information.

Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.

## License

Apache-2.0
