# AtYourScan (AYS) • Next-Gen Smart Hospitality Ecosystem

> **Warm, Editorial Minimalism for Modern Contactless Dining, Live Kitchen Display Systems (KDS), and Omnichannel POS.**

---

## ✦ Design Philosophy: Beyond "AI-Generated" Aesthetics

Most AI-generated UIs suffer from garish multi-color gradients, floating rounded neon cards, meaningless generic copy, and lack of tactile domain depth.

**AtYourScan** is crafted with an editorial, Swiss-inspired design system:
- **Warm Obsidian & Hairline Borders**: Deep zinc and obsidian surfaces (`#08080a`, `#141417`) framed by whisper-quiet 1px borders (`rgba(255, 255, 255, 0.08)`).
- **Tabular Figures & Micro-Typography**: Crisp monospace figures for prices (`₹740`), order tags (`#AYS-801`), and preparation counters.
- **Physical Feedback & Synthesized Audio**: Built-in Web Audio API synthesizers that generate organic brass kitchen bell chimes and tactile click pops without external audio file dependencies.
- **Real Culinary Craftsmanship**: Realistic artisanal dishes, authentic spice metrics, dietary badges (green square veg, red square non-veg), and live stock 86'ing.

---

## ✦ Core Subsystems

### 1. 📱 Customer Table QR Dine-In Experience
- **Mobile-first, responsive interface** customized for guest tabletop scans (e.g. Table 4).
- **Interactive Dietary & Category Pills**: All, Veg, Non-Veg, Chef's Signatures.
- **Dish Customizer Modal**: Select spice levels (Mild, Medium, Fiery Hot), add cooking notes (e.g. *"less salt, dressing on the side"*).
- **Live Cart & Bill Splitter**: Calculates GST (5%), service charges, and splits the bill cleanly across diners.
- **Instant UPI Checkout & Vector QR Code**: Generates real-time, razor-sharp SVG vector QR codes encoding `upi://pay?pa=...` with the exact bill amount.
- **Live Kitchen Status Timeline**: Real-time progress tracker (`Received` ➔ `In Preparation` ➔ `Plated & Ready` ➔ `Served`).
- **Tactile Assistance Buttons**: 1-tap "Call Waiter", "Request Water", "Clean Table".

### 2. 🍳 Kitchen Display System (KDS)
- **High-contrast dark mode** engineered for kitchen tablets and wall-mounted touchscreens.
- **Live Order Tickets** with real-time second-by-second elapsed timers.
- **Color-Coded Urgency Matrix**:
  - Green / Normal: `< 8 mins`
  - Amber / Warning: `8 – 15 mins`
  - Red / Urgent Pulse: `> 15 mins`
- **1-Click Bump Bar**: Advance tickets from `New` ➔ `Start Cooking` ➔ `Mark Ready` ➔ `Fulfill`.
- **Live Cooking Prep Tally**: Automatically aggregates pending dish quantities across all tickets (e.g. `4x Truffle Fries`, `2x Margherita Pizza`).
- **Kitchen Bell Chime**: Audible notification on incoming tickets.

### 3. 🖥️ Manager & POS Floor Terminal
- **Interactive Floor Map**: Live grid of Tables 1–12 with real-time states (Vacant, Ordering, Food Ready, Billed).
- **Omni-Channel Stream**: Consolidated feed of Dine-In QR, Takeaway, Swiggy, and Zomato orders.
- **Live Financial KPIs**: Real-time Gross Sales, Occupancy %, Kitchen Turnaround Time, Total Covers.
- **1-Click KOT & Tax Invoice**: Instant printable Kitchen Order Tickets and guest bills.
- **Rapid Walk-In Order Entry**: 2-tap order creation for bar and counter walk-in guests.

### 4. 📋 Menu & Realtime Inventory Control
- **Instant 86'ing**: Mark items out-of-stock with one tap, instantly updating guest menus and KDS.
- **Live Price Editor**: Real-time price updates without redeploying.
- **Stock Depletion Trackers**: Track item stock levels with low-stock warnings.

### 5. 🏷️ QR Tent-Card & Table Stand Studio
- **Printable Table Stand Generator**: Produces ready-to-cut tabletop acrylic tent cards for all tables.
- **Vector QR Engine**: Zero external CDN dependency; generates standards-compliant SVG matrices on the fly.
- **Print-Optimized CSS**: Clean `@media print` rules that format cards for physical A4 printing.

---

## ✦ Technology Architecture

- **Database**: PostgreSQL on Supabase conforming to `schema.sql` (`venues`, `tables`, `menu_items`, `orders`, `order_items`, `supabase_realtime` publication).
- **Hybrid Storage Layer (`src/store.js`)**: Reactive state machine with automatic Supabase Realtime synchronization and graceful local offline fallback.
- **UI & Styling**: Modern ES Modules, Tailwind CSS utility architecture, and custom editorial design tokens.
- **Bundler & Tooling**: Vite 5 for instant HMR and sub-second production builds.

---

## ✦ Getting Started

### 1. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. View Specific Table as a Guest
Append `?table=4` to simulate Table 4 QR scan:
```
http://localhost:3000/?table=4
```

### 3. View KDS Directly on Kitchen Tablet
Append `?view=kds`:
```
http://localhost:3000/?view=kds
```

### 4. Build for Production
```bash
npm run build
```

---

## ✦ Database Setup (Optional Remote Supabase)
To connect your live Supabase cloud project:
1. Ensure your `.env.local` has your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Apply `schema.sql` via Supabase SQL Editor.
3. The app automatically listens to real postgres changes over websockets!
