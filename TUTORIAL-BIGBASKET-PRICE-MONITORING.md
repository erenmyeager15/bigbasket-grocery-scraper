# How To Monitor BigBasket Prices And Stock With Apify

BigBasket grocery prices, discounts, and availability can change over time. Checking
the same listings manually is workable for one or two products, but it becomes slow
when a team needs a repeatable catalog snapshot.

This tutorial shows how to collect a small public BigBasket listing dataset, save the
configuration as an Apify Task, and schedule a daily run.

Actor: [BigBasket Grocery Scraper: Prices & Stock](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper)

## What The Workflow Collects

Each saved product can include:

- BigBasket product ID
- Product title, brand, and pack size
- Current price and MRP
- Discount percentage
- Rating and rating count when available
- Stock status
- Category, product URL, and image URL
- Scrape timestamp

The Actor reads public grocery listing data. It does not require a BigBasket login or
collect account, order, customer, seller-contact, or other private data.

## Step 1: Run A Small Snapshot

Open the Actor and use this input:

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

This limits the first snapshot to one search term, one result page, and five products.
Residential India proxy is recommended because prices and availability can be regional.

Run the Actor and open the `Products` dataset view. Confirm that the returned brand,
pack sizes, and products match the monitoring requirement before scheduling anything.

## Step 2: Save The Input As A Task

On the Actor page, select **Save as a new task**. Give the task a clear name such as
`daily-amul-milk-snapshot`.

A Task stores the input so the same configuration can be run again manually, through
the API, or from an Apify Schedule.

## Step 3: Create A Daily Schedule

Open **Schedules** in Apify Console, create a schedule, and select the saved task. Begin
with one run per day. Increase the frequency only when the use case justifies the added
requests, proxy traffic, and platform cost.

Avoid creating overlapping or duplicate schedules.

## Step 4: Compare Snapshots

Use `productId` as the preferred stable key, with `productUrl` as a fallback. Compare
these fields between runs:

| Field | Why it matters |
| --- | --- |
| `price` | Current public listing price |
| `mrp` | Reference price when exposed |
| `discountPercent` | Visible discount movement |
| `inStock` | Availability change |
| `packSize` | Prevents comparing different quantities |
| `scrapedAt` | Identifies when the snapshot was collected |

Export datasets as CSV, Excel, or JSON, or read them through the Apify API. For an
automated workflow, send each snapshot to a database, spreadsheet, or webhook receiver
and calculate changes there.

## Important Limitations

- The Actor produces current snapshots; it does not maintain historical prices itself.
- It does not send built-in price-change or stock alerts.
- It does not automatically match equivalent products across different stores.
- Prices and availability may vary by region and delivery context.
- Optional fields can be missing when BigBasket does not expose them in a listing.
- The Actor is not an official BigBasket API and is not affiliated with BigBasket.

## Cost And Reliability Tips

1. Validate one keyword before adding more.
2. Keep `maxPagesPerSource` at `1` initially.
3. Start with five or fewer results.
4. Use a daily schedule before considering a higher frequency.
5. Keep the same regional proxy context for comparable snapshots.
6. Use Apify's maximum run cost setting when a strict cap is required.

## Final Workflow

The complete pattern is:

```text
BigBasket public listings
        -> Apify Actor
        -> scheduled dataset snapshot
        -> spreadsheet/database
        -> price and stock comparison
        -> optional downstream alert
```

Start with a small verified snapshot and expand only after the output is relevant and
the recurring cost is understood.
