# SLAB Deck Works

A fictional skate shop you browse in 3D, built to show how an immersive storefront can scale to a real catalog. It has 305 products: decks, wheels and trucks.

- **3D rooms per category.** The wall has a Decks, a Wheels and a Trucks room, each showing a curated set. Hover makes a product spring off the wall; click it and the camera pushes in while its product card flips into view.
- **Browse all, for the full range.** A drawer with search, category, size and price filters, sort, and a virtualized grid: only the cards on screen exist, so 300 or 30,000 products scroll the same. Pick any product and it's built in 3D on demand and rises onto the stage.
- **Counter and checkout.** Cart items drop onto a walnut counter and a split-flap board tallies them. A glass checkout rises out of the counter. It's a demo: no payment fields, and nothing leaves the browser.
- **Slab, the AI assistant (chat + voice).** It searches the whole catalog, opens filtered results, shows products, adds to the cart and opens checkout, driving the 3D scene as it goes.
- **Mobile.** A two-row header with swipeable category tabs, a full-screen Browse drawer, bottom-sheet cards, and swipe left/right between rooms and up/down to the counter. Phones get half-resolution generated textures and a lower pixel ratio, so they start faster.
- **Shopping basics.**
  - A cart drawer (items, remove, total, Checkout); the cart is saved across visits.
  - Real links (`#/p/ember`, `#/wheels`, `#/browse?q=teal&cat=decks`), so Back and Forward work and products can be shared.
  - A first-visit welcome, and an order receipt after checkout.
- **Lite store.** If WebGL or three.js can't run (old device, blocked CDN), or with `?lite`, the same catalog, search, cart, links and checkout run as a plain 2D store.

Plain ES modules and [three.js](https://threejs.org) 0.170 from a CDN, with no build step. Every model and texture is generated in code, so the repo has no image or model files. The one asset is the shop music, `audio/a-chill-fever.mp3`. The assistant runs on Groq (`openai/gpt-oss-120b`, tool calling) behind one serverless function, so the API key never reaches the browser.

## Run locally

```sh
cp .env.example .env.local   # put your Groq key in it (free at console.groq.com/keys)
npm start                    # http://localhost:8080: the site plus /api/chat
npm test                     # catalog, search/filters, cart, flip board and assistant logic (node --test)
```

Without a key the shop works normally and Slab says it isn't set up yet. Groq's free tier allows about 8,000 tokens per minute, roughly 3–4 assistant turns per minute. Slab waits out short limits by itself; for client demos with many people, use Groq's Dev tier.

## Deploy (Vercel)

1. Import the folder into Vercel. No framework or build command is needed; `api/chat.js` becomes the function.
2. In Project → Settings → Environment Variables, add `GROQ_API_KEY` (and optionally `GROQ_MODEL`).
3. Deploy. `.vercelignore` keeps `.env*`, `dev-server.js` and the tests out of the upload.

## How it scales to a big catalog

| Concern | Approach |
| --- | --- |
| Finding things | 3D rooms show curated sets; the full catalog lives in the Browse drawer (search, filters, sort) and in the assistant |
| DOM size | Virtualized grid: only visible cards plus a little overscan are rendered |
| GPU memory | One shared geometry per product type, with only the artwork swapped. Picked products are built on demand; a small LRU cache disposes the rest |
| Thumbnails | Drawn once per product and cached (capped) |
| Counter | Up to five copies per kind; the flip board lists everything ("+N MORE") |
| Search | One pure `filterProducts` shared by the drawer and the assistant's `search_products` tool |

In production, `catalog.js` becomes a paged, edge-cached API, and thumbnails and textures move to a CDN. The UI shape stays the same.

## Controls

- **Rooms:** the tabs at the top, ← / → keys, or a horizontal swipe on phones. Hover a product to make it pop out; click it for the close-up and card.
- **Picked product (full 360°):**
  - Drag, or scroll / two-finger swipe, to turn it any way: sideways spins it, up and down tumbles it over to show the grip tape.
  - Zoom with a pinch (trackpad or touch) or ⌘/Ctrl+scroll.
  - Double-click or double-tap to reset. Keyboard: arrows, + / − and 0.
  - Click off the product to put it back.
  - On phones the details card collapses to a slim bar as soon as you start turning. Tap the card's handle to bring the details back.
- **Browse all:** search and filter, then click a card. **Back to results** returns you to the grid where you left it.
- **Counter:** scroll, swipe up, ↓, or **Cart**. Click the brass **CHECKOUT** plate.
- **Ask Slab:** the bottom-left button. Type, tap a suggestion, or use the mic.
- **Keyboard:** Tab reveals a menu of every featured product plus Counter and Checkout. Esc closes whatever is open.

## Layout

| File | Job |
| --- | --- |
| `js/boot.js` | Entry point: starts the 3D store, or the lite store when WebGL/three.js can't run (or `?lite`) |
| `js/loader.js` | The opening: the SLAB wordmark holds the screen until fonts and the first rendered frame are ready, then flies into the header logo (a plain fade on repeat visits and with reduced motion) |
| `js/main.js` | Renderer, camera poses, the wall/focus/counter/checkout state machine, rooms, staging, turning, input, links, the controller the assistant drives |
| `js/lite.js` | The 2D lite store built from the same parts |
| `js/router.js` | Hash routes: parse and format links for rooms, products, Browse filters and the counter (unit-tested) |
| `js/cart-store.js` | Saves the cart in localStorage, tolerating missing or blocked storage (unit-tested) |
| `js/cart-ui.js`, `js/product-card.js` | The cart drawer and order receipt; the product card and Share |
| `js/thumbs.js`, `js/deck-art.js` | 2D thumbnails and deck artwork (no three.js, so the lite store can use them) |
| `js/micro.js` | Interaction details: rolling numbers, morphing button labels, a focus-keeping busy state (no double orders), hold-to-remove with Undo, the sliding tab pill |
| `js/catalog.js` | 5 hero decks plus a deterministic generated range (305 products); shared with the server |
| `js/browse.js` | Pure search, filters, sort, size options and price range |
| `js/browse-ui.js` | The Browse drawer and its virtualized grid |
| `js/product-mesh.js` | Builds any product in 3D, LRU mesh cache with GPU disposal, cached thumbnails |
| `js/deck.js`, `js/gear.js` | Deck geometry and art; wheel sets and trucks (and their thumbnails) |
| `js/scene.js` | Wall, floor, room labels, shelves and boards, lights, veil |
| `js/counter.js` | The counter (walnut slab, steel frame, slats, brass plate, LED glow, props) and the CHECKOUT plate |
| `js/board.js`, `js/flaps.js` | The split-flap board: folding-flap drawing and the cascade logic |
| `js/cart.js` | Cart and board text (with "+N MORE" overflow) |
| `js/assistant.js`, `js/voice.js` | The Ask Slab chat panel and Web Speech voice in and out |
| `js/tween.js`, `js/random.js`, `js/texture-utils.js` | Tweens and easing, seeded randomness, canvas-texture helpers |
| `api/chat.js` | Vercel Function: origin check, rate limit, input limits, friendly errors |
| `api/_agent.js` | Prompt, tools (search, show, cart, rooms, counter, checkout), validation, and the Groq loop with retries |
| `js/cassette.js`, `audio/` | The tape-deck button that plays the shop music. Track: "A Chill Fever" by Pro Sensory, [CC0](https://opengameart.org/content/a-chill-fever-loopable) |
| `dev-server.js` | Local stand-in for Vercel: allowlisted static files plus `/api/chat` |
