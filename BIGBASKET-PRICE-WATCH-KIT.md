# BigBasket Price Watch Kit

Use this kit to turn BigBasket listing snapshots into a repeatable price, stock, and catalog workflow. The Actor collects the current public listing state. Your connected table or automation stores history and calculates changes.

## Ready-to-run tasks

1. [Monitor BigBasket prices and stock](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/monitor-bigbasket-prices-and-stock)
2. [Collect BigBasket prices, MRP and discounts](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/collect-bigbasket-prices-mrp-discounts)
3. [Export a BigBasket category catalog](https://apify.com/fascinating_lentil/bigbasket-grocery-scraper/examples/export-bigbasket-category-catalog)

Start with the published defaults. Change the keywords, category URL, brands, and result limit only after the first run returns the products you expect.

## Daily monitoring workflow

1. Create a task from the price-and-stock example.
2. Keep one page per source and a small result limit while validating it.
3. Create an Apify Schedule and run the task once per day.
4. Store every successful run in a table using `productId` as the primary key and `scrapedAt` as the observation time.
5. Compare `price`, `mrp`, `discountPercent`, and `inStock` with the previous observation.
6. Alert only when a tracked value changes.

Do not compare runs that use different delivery regions or proxy countries. BigBasket prices and availability can vary by location.

## Send successful runs to Google Sheets

Use Make, n8n, Zapier, or another workflow tool:

1. Add an Apify webhook for the `ACTOR.RUN.SUCCEEDED` event on the saved task.
2. Read `resource.defaultDatasetId` from the webhook payload.
3. Fetch the clean rows from:

   ```text
   https://api.apify.com/v2/datasets/DATASET_ID/items?clean=true&format=json
   ```

4. Add or update rows in Google Sheets using `productId` as the product key.
5. Keep a separate observation row for each `scrapedAt` value if you need history.
6. Compare the latest two observations and send email, Slack, or Discord notifications only for changed fields.

Store the Apify API token in the workflow platform's secret manager. Never put it in a public task, sheet, README, webhook URL, or screenshot.

## Suggested Google Sheets columns

```text
productId, title, brand, packSize, price, mrp, discountPercent, inStock,
category, productUrl, imageUrl, searchQuery, scrapedAt
```

For a change log, add:

```text
previousPrice, priceChange, previousStock, stockChanged, observedAt
```

## Cost controls

- Begin with one keyword, one page, and 5-25 results.
- Run daily before considering a higher frequency.
- Keep one schedule per use case and remove duplicate schedules.
- Use the run maximum-cost setting for a hard cap.
- Increase category pages and result limits only after checking the first export.

## Scope

This kit monitors public BigBasket listing snapshots only. It does not provide customer data, order data, cross-store product matching, automatic repricing, or built-in historical storage. Review source terms and applicable law before using the workflow.
