# NOVAX OS — Proiect complet refăcut

Refacere integrală și curată a site-ului Novax Web cu plăți Stripe + livrare
automată de licențe prin MongoDB (Mongoose).

## Structură

```
novax_rework/
├── server.js            # backend Express: Stripe, webhook, admin, catalog, MongoDB
├── package.json         # dependențe curate (fără mysql2)
├── .env.example         # variabile de mediu de copiat în Render
└── public/
    ├── index.html       # storefront (Tailwind) — afișează catalogul din API
    ├── app.js           # frontend logic: coș + checkout (referit de index.html)
    ├── admin.html       # dashboard admin licențe/HWID
    ├── success.html     # după plată — afișează cheia generată
    ├── cancel.html      # plată anulată
    └── style.css        # stil admin + pagini checkout
```

## Ce a fost reparat / refăcut

| Problemă | Rezolvare |
|----------|-----------|
| Checkout dădea „Produs invalid." | Payload-ul trimis de frontend se potrivește acum cu ce așteaptă serverul (`items[]`). |
| ID-uri nealiniate (`prod_fivem_24h` vs `cheat-fivem-...`) | Un singur `CATALOG` = sursă unică; frontend-ul îl citește din `GET /api/v1/products`. |
| `/api/v1/products` nu exista | Ruta a fost adăugată. |
| Admin-ul apela rute inexistente | `GET /api/admin/licenses`, `POST /api/admin/reset-hwid`, `POST /api/admin/toggle-ban` implementate. |
| Licențe nu se generau | Webhook Stripe `checkout.session.completed` generează și salvează cheia în MongoDB. |
| MySQL (mysql2) dar mongoose în pachete | Trecut complet pe MongoDB (mongoose). |
| `app.js` era cod mort, nefolosit | `index.html` îl referă acum (`<script src="app.js">`). |
| Body-ul webhook-ului ar fi fost consumat | `express.json({ verify })` salvează raw body pentru verificarea semnăturii Stripe. |

## Instalare / configurare

1. **Copiază** conținutul folderului `novax_rework/` peste proiectul tău (înlocuiește
   `server.js`, `package.json` și adaugă `public/`).
2. **Instalează** dependențele: `npm install` (înlocuiește `package-lock.json`).
3. Creează un fișier `.env` (sau setează în Render → Environment) cu valorile din `.env.example`.

### În Render setează aceste variabile
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
MONGODB_URI=mongodb+srv://...
BASE_URL=https://novax-web.onrender.com
ADMIN_KEY=o-parola-secreta-pentru-admin
```
> Dacă `STRIPE_WEBHOOK_SECRET` e gol, webhook-ul acceptă evenimente nesemnate — **folosește-l doar în dezvoltare**. În producție pune-l mereu.

### Webhook în dashboardul Stripe
Adaugă endpoint-ul webhook și abonează-te la evenimentul **`checkout.session.completed`**:
```
https://novax-web.onrender.com/webhook/stripe
```

## Cum schimbi un preț (corect)
Doar în `server.js` → `CATALOG` → `priceEUR`. Fă push. Gata. Nu mai editezi HTML.

## Testare rapidă
```bash
npm install
node server.js        # după ce ai MongoDB și variabilele setate
```
Deschide `http://localhost:3000`, adaugă produse în coș, introdu email, plătește.
Cu cheile de test Stripe (`4242 4242 4242 4242`) funcționează fără bani reali.

## Note de securitate
- `admin.html` trimite `x-admin-key` din câmpul de parolă; pe server e comparat cu `ADMIN_KEY`.
  Dacă `ADMIN_KEY` e gol, admin-ul e deschis (doar pentru dev).
- Prețurile vin **exclusiv** de pe server; clientul nu poate decide prețul.
