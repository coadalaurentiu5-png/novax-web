# NOVAX OS — Paye la Paysafecard, livrare prin Discord

Site-ul acceptă **doar Paysafecard** ca metodă de plată. Plata **NU se procesează
automat** (fără cont de comerciant la Paysafe nu poți verifica automat un PIN) —
clientul primește o **chitanță cu Receipt ID**, merge pe Discord, deschide un
tichet, iar **staff-ul verifică PIN-ul manual** și livrează produsul.

## Cum funcționează

1. Clientul pune produse în coș, introduce email + **PIN Paysafecard (16 cifre)**.
2. Sistemul validează PIN-ul (16 cifre), calculează suma din `CATALOG` și creează
   o comandă cu **Receipt ID unicat** + cronometru de expirare (10 min).
3. **Staff-ul** primește notificare pe canalul secret de Discord (Receipt ID, sumă,
   email, produse, PIN).
4. Clientul e dus pe `receipt.html` → apasă **Discord** → deschide tichet → lipește
   Receipt ID-ul.
5. Staff-ul verifică PIN-ul, livrează produsul manual și marchează comanda ca
   verificată în admin.

## Rute backend

| Ruta | Rol |
|------|-----|
| `GET /` | index.html |
| `GET /api/v1/products` | catalog |
| `POST /api/paysafe/create` | creează comanda Paysafe |
| `GET /api/paysafe/status/:receiptId` | starea chitanței |
| `GET /api/admin/paysafe` | listă comenzi (admin) |
| `POST /api/admin/paysafe/complete` | marchează verificat (admin) |
| `GET /health` | health-check |

## Variabile de mediu (Render → Environment)

| Variabilă | Ce pui |
|-----------|--------|
| `MONGODB_URI` | linia `mongodb+srv://...` de la Atlas |
| `BASE_URL` | `https://novax-web.onrender.com` |
| `ADMIN_KEY` | parolă pentru admin |
| `DISCORD_INVITE_URL` | link-ul permanent al serverului Discord |
| `DISCORD_WEBHOOK_URL` | webhook pe canalul SECRET de staff |
| `PAYSAFE_ORDER_TTL_MINUTES` | `10` |

> ⚠️ `DISCORD_WEBHOOK_URL` trebuie să fie pe un canal **privat** (doar staff-ul),
> pentru că primește emailuri, sume și PIN-uri.

## Cum urci pe GitHub

Fișierele din folderul `NovaX_web/`:
- `server.js`, `package.json`, `.env.example`
- `public/index.html`, `public/app.js`, `public/receipt.html`, `public/admin.html`,
  `public/style.css`, `public/success.html`, `public/cancel.html`

După urcare, Render se redeploy-uieste singur la push.
