# Colmena Market

A small full-stack commerce demo by [Román González](https://github.com/romangon10), built to demonstrate browser interactions, API validation, relational persistence and automated testing.

**Demo only:** no real payments, shipping, personal customer data or seller accounts. Prices are illustrative ARS amounts. Product photos illustrate categories rather than specific items for sale.

## Run locally

Requires **Node.js 24.14 or later in the Node 24 series**. Uses built-in Node modules; no third-party packages or installation step is needed.

```sh
git clone https://github.com/romangon10/Colmena-Market.git
cd Colmena-Market
git switch feature/full-stack-market
npm start
```

Open `http://127.0.0.1:3000`. Opening `index.html` directly or publishing to GitHub Pages will not run the API.

```sh
npm test
npm run check
npm run dev
```

`PORT` changes the listening port; `DB_PATH` changes the SQLite file location. Defaults: port 3000, `data/market.sqlite`. The server binds to loopback for local use.

## Implemented

- Responsive Spanish storefront with category filtering, text search and price sorting.
- Accessible native dialog cart with quantity controls, loading states and retry feedback.
- Products, stock, orders and order line snapshots in a file-backed SQLite database.
- Server-side prices stored as integer centavos; the API ignores submitted prices and totals.
- Atomic orders: either every requested item is in stock and saved, or nothing changes.
- Idempotent checkout: retrying the same request key and items returns the original receipt.
- Parameterized SQL, bounded JSON bodies, explicit public asset allowlist and security headers.
- Automated store and HTTP integration tests, including database reopen persistence.

## Architecture

| Layer | Files | Responsibility |
| --- | --- | --- |
| Browser | `index.html`, `style.css`, `script.js` | Catalog, temporary in-memory cart, checkout feedback |
| HTTP | `server/index.js` | Routes, content types, body limits and public asset serving |
| Persistence | `server/store.js` | SQLite schema, catalog queries and transactional checkout |
| Tests | `test/market.test.js` | Business rules, persistence and HTTP boundaries |

The browser cart is temporary and clears on page reload. Confirmed orders persist in SQLite across server restarts. The server recalculates totals and checks stock on every new order.

## API

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Health response |
| GET | `/api/products?q=camisa&category=Ropa&sort=price-asc` | Catalog; optional search, category and ordering |
| POST | `/api/orders` | Creates a demo order; requires JSON and `Idempotency-Key` |

```sh
curl http://127.0.0.1:3000/api/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-order-00000001' \
  -d '{"items":[{"id":1,"quantity":2}]}'
```

Responses: `201` new order; `200` replay; `400` invalid input; `404` missing product; `409` insufficient stock or reused key with different items; `413` oversized body; `415` wrong content type. There is deliberately no public endpoint listing customer orders.

## QA coverage

Tests verify catalog filtering, SQL input handling, server-controlled totals, stock updates, duplicate requests, invalid quantities, all-or-nothing checkout, missing products, restart persistence, HTTP response codes and private-file protection.

Manual browser checks still to perform: keyboard dialog interaction, small-screen layout, external photo availability and full checkout interaction. Browser visual/end-to-end verification has not been performed.

## Scope and next milestones

This is a local portfolio demo, not a production commerce service. Authentication, seller administration, rate limiting, real payments, deployment configuration and schema migration tooling are not implemented. Public deployment requires those decisions plus HTTPS and a persistent disk. SQLite runs synchronously and is intended here for a small demo workload.

Next development stages: React/TypeScript UI, authenticated seller dashboard, PostgreSQL migrations, API documentation and browser regression tests. These are planned, not included in this version.

## Photo credits

Externally hosted images; availability and reuse terms belong to their respective owners. They are illustrative references and are not bundled or relicensed. Replace with owned/licensed assets before a public commercial release.

- Perfume: [Skai Lama demo store](https://skailama-demo.myshopify.com/products/amber-dream)
- Shirt: [Bosch](https://www.bosch-home.com/de/bosch-erleben/magazin/haushaltstipps/weisse-waesche)
- Jeans: [Zalando Lounge](https://www.zalando-lounge.de/jeans-outlet/)
- Shoes: [Jousen](https://www.jousenshoes.com/products/jousen-mens-fashion-sneakers-white-shoes-for-men-casual-breathable-shoes)

## Contact

[GitHub](https://github.com/romangon10) · [LinkedIn](https://www.linkedin.com/in/romannicolasgonzalez/)
