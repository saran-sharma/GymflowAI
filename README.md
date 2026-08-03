# GymFlow AI — MVP Demo

A clickable front-end demo of **GymFlow AI**, an AI assistant that answers gym enquiries on
WhatsApp and Instagram, books free trials, and chases membership renewals.

This is **not** a complete SaaS product. It is a showcase build for a gym-owner demo:
every number is dummy data, there is no backend, no database and no API calls.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Build a static bundle to hand over or host anywhere:

```bash
npm run build    # outputs to dist/
npm run preview
```

## Deploying it

The repo ships a GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) that builds
the app and publishes it to GitHub Pages on every push to `main`. Once the first run finishes,
the demo is live at:

```
https://saran-sharma.github.io/GymflowAI/
```

That is a plain public URL — good for sending to a gym owner over WhatsApp, and it carries a
link-preview card (`public/og.png`). If the first run fails on permissions, set
**Settings → Pages → Source** to **GitHub Actions** and re-run the workflow.

## Pages

| Route | Page | What it shows |
|---|---|---|
| `/` | **Landing** | Hero — *Convert More Leads into Members with AI* — with a **Start Free Trial** CTA and the four features: WhatsApp AI Replies, Instagram DM Automation, Membership Renewal Reminders, Lead Dashboard. |
| `/#/dashboard` | **Owner Dashboard** | Cards for New Leads (18), Trial Bookings (9), Active Members (126), Renewals Due (14) and Revenue This Month (₹2,18,000), plus *Leads this week* and *Membership growth* charts and an AI activity feed. |
| `/#/leads` | **Leads** | Name / Source / Status / Action table with search and status filters. Rahul, Priya and Ajay lead the list. |
| `/#/whatsapp` | **WhatsApp Bot Demo** | The scripted pricing enquiry and the AI's reply, with **Book Trial** and **Talk to Trainer** quick replies that continue the conversation live. |
| `/#/members` | **Members** | Search member, membership expiry, attendance %, and a **Renew Membership** action per member. |

## Stack

- React 19 + Vite
- Tailwind CSS (dark theme, green accent)
- Recharts for the dashboard charts
- lucide-react for icons
- `HashRouter`, so the built `dist/` folder works on any static host without rewrite rules

## Design notes

- **Dark theme by design**, not a flipped light theme — surfaces, text and chart marks were
  picked against the dark chart surface (`#111a15`).
- **Chart colour is validated, not eyeballed.** The single series green (`#16a34a`) clears the
  lightness band, chroma floor and the 3:1 contrast check against the chart surface. Each chart
  carries one series, so no categorical palette is in play.
- Every chart has a hover tooltip and a **Data** toggle that swaps the plot for the underlying
  table, so the numbers are never colour-only.
- Status and expiry badges always pair colour with an icon and a text label.
- Mobile responsive throughout: the sidebar becomes a drawer, and the Members table becomes cards.

## Demo interactions

These are front-end only — nothing is sent anywhere:

- Lead row actions (**Send WhatsApp**, **View**, **Message**) show a confirmation toast.
- **Book Trial** / **Talk to Trainer** advance the bot conversation and log a "live action".
- **Renew Membership** flips the row to *Renewed* and extends the expiry by a month.
