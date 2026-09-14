# Colmena Market

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=111) ![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white) ![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white) ![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle&logoColor=111) ![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-F38020?logo=cloudflare&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white)

A small full-stack commerce demo by [Román González](https://github.com/romangon10), built to demonstrate browser interactions, API validation, relational persistence and automated testing.

**Demo only:** no real payments, shipping, personal customer data or seller accounts. Prices are illustrative ARS amounts. Product photos illustrate categories rather than specific items for sale.

## Run locally

Requires **Node.js 24.14 or later in the Node 24 series**. Uses built-in Node modules; no installation step is needed for local execution. Building migrations uses the pinned development dependencies (`npm ci`).

```sh
git clone https://github.com/romangon10/Colmena-Market.git
cd Colmena-Market
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
- Accessible native dialogs for product quick view and cart, with quantity controls, loading states and retry feedback.
- Favorites, favorites-only filtering and cart state persisted locally in the browser.
- Products, stock, orders and order line snapshots in a file-backed SQLite database.
- Server-side prices stored as integer centavos; the API ignores submitted prices and totals.
- Atomic orders: either every requested item is in stock and saved, or nothing changes.
- Idempotent checkout: retrying the same request key and items returns the original receipt.
- Parameterized SQL, bounded JSON bodies, explicit public asset allowlist and security headers.
- Automated store and HTTP integration tests, including database reopen persistence.

## Architecture

| Layer | Files | Responsibility |
| --- | --- | --- |
| Browser | `index.html`, `style.css`, `script.js` | Catalog, favorites, persistent local cart, quick view and checkout feedback |
| HTTP | `server/index.js` | Routes, content types, body limits and public asset serving |
| Persistence | `server/store.js` | SQLite schema, catalog queries and transactional checkout |
| Tests | `test/market.test.js` | Business rules, persistence and HTTP boundaries |

The browser stores favorites and the unconfirmed cart in local storage so they survive a page reload. Confirmed orders persist in SQLite across server restarts. The server recalculates totals and checks stock on every new order.

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

Tests verify JavaScript syntax, catalog filtering, SQL input handling, server-controlled totals, stock updates, duplicate requests, invalid quantities, all-or-nothing checkout, missing products, restart persistence, HTTP response codes and private-file protection.

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

## Online deployment

The `worker/` adapter serves the same storefront on Cloudflare Workers with a persistent D1 database. The local Node/SQLite server remains available. `db/schema.ts` and generated `drizzle/` migrations own the hosted schema; seeding inserts the four demo products without restoring consumed stock.

Run `npm ci`, `npm run db:generate` after schema changes, and `npm run build` to package the Worker. `.openai/hosting.json` identifies the privately hosted Site. Hosting applies the generated migrations before deploying. Hosted request handlers use the Web Request/Response APIs instead of a Node HTTP listener.
