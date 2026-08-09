# GymFlow AI

**The Smart Operating System for Modern Gyms** — an interactive front-end demo, configured for a
premium studio (SLAM Fitness Studio).

Frontend only. No backend, no authentication, no API calls, no storage. Every figure is realistic
dummy data and every button does something — navigates, opens a flow, or simulates the real action
with a clearly-labelled confirmation.

Live: **https://saran-sharma.github.io/GymflowAI/**

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
```

## What's in it

| Route | Screen | Highlights |
|---|---|---|
| `/` | **Landing** | Hero, features, playable product tour, testimonials, plans, CTA, Book Free Trial flow |
| `/#/demo` | **Guided demo** | The 10-step member journey, with live counters that move as you run each step |
| `/#/live` | **Live Gym Experience** *(hero feature)* | Occupancy, crowd level, best time to visit, wait time, per-machine availability with waitlists, lockers, showers, parking |
| `/#/member` | **Member dashboard** | Membership status, attendance grid and streak, today's workout, calories, water, weight/fat/muscle, next PT, QR check-in, renew, freeze, guest pass, referrals |
| `/#/member/training` | **Training & Diet** | Weekly split, today's session, macros and meals, workout and diet history, medical and injury notes |
| `/#/member/progress` | **Progress & InBody** | Full 15-metric InBody sheet, transformation graph, segmental analysis, AI suggestions, trainer note, progress photos, timeline |
| `/#/assistant` | **AI member assistant** | All nine scripted requests — crowd, PT booking, workout, diet, attendance, renewal, freeze, trainer availability, quiet hours |
| `/#/pt` | **PT booking** | Trainer profiles, live slots, package vs paid booking, payment flow, confirmation with GST split, session history |
| `/#/smart` | **Smart features** | Challenges, leaderboard, buddy matching, badges, cafe/supplement/merch ordering with a cart, wearables, rewards |
| `/#/trainer` | **Trainer desk** | Today's sessions, week calendar, client roster with assignments, progress reports, earnings and pending payments |
| `/#/entry` | **Live entry & exit** | Fingerprint, face, QR and RFID — tap any device to simulate a check-in and watch occupancy move |
| `/#/owner` | **Owner dashboard** | Ten stat cards, six charts, and seven AI business insights with actions |
| `/#/billing` | **Billing & GST** | Invoice ledger, full tax-invoice view with CGST/SGST split, payment methods, promo codes |
| `/#/channels` | **WhatsApp & Instagram AI** | Interactive WhatsApp bot with quick replies, Instagram DM automation and lead capture |
| `/#/reports` | **Reports** | All 13 reports plus scheduled delivery |
| `/#/admin` | **Admin** | Employees and role-based access, multi-branch, audit log, inventory, expenses, vendors, tickets, campaigns |
| `/#/integrations` | **Integrations** | All 15 integrations by category, and how one member action updates four systems |

## Design

- **Matte black, premium red.** Surfaces run `#08080a` → `#141417`; the accent is `#ef2b3c`.
  Neutrals carry a faint red bias so ground and accent read as one family.
- **Glassmorphism** — translucent panes with a lit top edge, over an ambient red pool.
- Dark-theme only, by design.
- Mobile responsive throughout: the sidebar becomes a drawer, tables scroll or become cards.
- `HashRouter`, so the built `dist/` works on any static host without rewrite rules.

### Charts

Chart colour is computed, not eyeballed:

- The single-series red (`#ef2b3c`) clears the lightness band, chroma floor and 3:1 contrast against
  the chart surface (`#141417`).
- The five-hue categorical set used for Lead Sources passes adjacent-pair CVD separation
  (worst ΔE 8.4) and the normal-vision floor (worst ΔE 19.8). It is used **only** for bars with
  direct labels — never a pie or scatter, where the violet/blue pair would fail all-pairs.
- Every chart has a hover tooltip and a **Data** toggle that swaps the plot for the underlying
  table, so numbers are never colour-only. Status badges always pair colour with an icon and label.
- No dual-axis charts anywhere: body fat and muscle share one scale, everything else is its own chart.

### The studio logo

The real SLAM mark is in the build — sidebar, landing hero, footer and the WhatsApp preview card.

The supplied artwork is a JPEG with the wordmark on an opaque white background, which would show as
a white box on a matte-black UI. `.logo.mjs` derives three transparent PNGs from it into
`public/img/`:

| File | What it is | Used for |
|---|---|---|
| `slam-logo-dark.png` | white wordmark, brand-red "L", full lockup | dark surfaces at 28px+ |
| `slam-wordmark-dark.png` | same, tagline cropped off | chips and small placements, where the tagline would be unreadable |
| `slam-logo-light.png` | original ink, transparent background | light surfaces |

Alpha comes from pixel luminance, so anti-aliased edges stay smooth, and each file is trimmed to the
artwork's bounding box. The source JPEG lives in `brand/` and is not shipped. Re-run `node .logo.mjs`
if the artwork changes.

### Other artwork

There is no stock photography in the build. Imagery comes from `<Scene>` — duotone SVG scenes drawn
from geometric gym equipment (rack, dumbbells, cardio row, kettlebells, athlete silhouette) over a
brand-tinted ground. They scale perfectly, cost nothing to load and stay on-palette.

### Adding real photos

Every image slot is listed in **`src/data/photos.js`** — 16 of them, across the landing floor strip
and feature cards, the trainer profiles in PT booking, and the member progress photos. Point a key
at an image and it appears; no other file needs touching.

```js
export const photos = {
  strengthFloor: './img/floor.jpg',                  // a file in public/img/
  cardioZone:    'https://example.com/cardio.jpg',   // or any hosted URL
  studio:        null,                               // null = use the drawing
}
```

Photos keep the same framing and brand tint as the artwork they replace.

**Failed images fall back to the drawing.** Wrong path, host down, offline — the slot renders the
duotone scene instead of a broken image, so there is never a hole in the page mid-pitch. Verified by
pointing slots at a missing file and an unreachable URL: zero broken images, artwork rendered.

Where to get them, best first:

1. **SLAM's own photos.** A gym owner seeing their own floor in the product beats any stock library.
2. **Free commercial-use stock** — [unsplash.com](https://unsplash.com/s/photos/gym),
   [pexels.com](https://www.pexels.com/search/gym/). Download and put the files in `public/img/`.

Avoid lifting images straight from an image-search results page: those are other people's
copyrighted photos, and this demo is published publicly.

### Demo controls

- **Persona switcher** in the top bar flips the demo between Member, Trainer and Owner, and lands on
  that person's home screen. The header follows whatever route you're on.
- **Guided demo steps are jumpable** — run them in order for the full story, or click any step's icon
  to jump straight to the one you want to show.

### Robustness

- Route changes scroll to the top *instantly*. Smooth scrolling is scoped to the landing page (where
  the anchor links live) — enabling it globally makes route changes animate the scroll and can leave
  a phone viewport parked in empty space until you reload.
- An **error boundary** turns any render failure into a recovery card with a Reload button, never a
  blank screen.
- `index.html` **self-heals a stale cache**: asset filenames are content-hashed, so an `index.html`
  cached from an earlier deploy would request a bundle that no longer exists and render blank. If the
  app hasn't mounted shortly after load, it forces one cache-busting reload (guarded against loops).

## Deploying

`.github/workflows/deploy-pages.yml` builds and publishes to GitHub Pages on every push to `main`.
The shared link carries an Open Graph card (`public/og.png`) so it previews properly on WhatsApp.

## Demo notes

Nothing leaves the browser. Payments, invoices, WhatsApp messages and check-ins are all simulated,
and every confirmation toast says so explicitly.
