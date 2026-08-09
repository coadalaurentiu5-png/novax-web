// =====================================================================
// NOVAX OS — server.js (backend complet, refăcut)
// ---------------------------------------------------------------------
// Stack: Node.js + Express + MongoDB (Mongoose) + Cluster
// Rute:
//   GET  /                        -> index.html (storefront)
//   GET  /api/v1/products         -> catalog (sursa de adevar)
//   POST /api/paysafe/create      -> creează o comandă Paysafecard (chitanță)
//   GET  /api/paysafe/status/:id  -> verifică starea chitanței
//   GET  /api/admin/paysafe       -> listă comenzi (admin)
//   POST /api/admin/paysafe/complete -> marchează verificat (admin)
// =====================================================================

require('dotenv').config();
const cluster = require('cluster');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const mongoose = require('mongoose');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/novax';
const BASE_URL = String(process.env.BASE_URL || '').trim().replace(/\/+$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // daca e gol, admin-ul e deschis (doar dev)

// ---------------------------------------------------------------------
// [MASTER] — pornește câte un worker per nucleu și-i repornește la crash
// ---------------------------------------------------------------------
// IMPORTANT: pe Render free tier resursele sunt minime (0.1 CPU). Rularea
// a mai multor workers cauzează crash-uri și instabilitate. Folosim 1 worker.
// Dacă rulezi pe un VPS cu resurse, setează WEB_CONCURRENCY la numărul dorit.
const WORKERS = (parseInt(process.env.WEB_CONCURRENCY || '1', 10) || 1);

if (cluster.isMaster) {
    const numCPUs = WORKERS;
    console.log(`\n======================================================`);
    console.log(` 💻 NOVAX OS - CORE ENGINE INIȚIALIZAT`);
    console.log(` ⚙️ ${os.type()} ${os.release()} | Arhitectură: ${os.arch()}`);
    console.log(` 🧠 Clustering activ pe ${numCPUs} worker(s)`);
    console.log(`======================================================\n`);

    for (let i = 0; i < numCPUs; i++) cluster.fork();

    cluster.on('exit', (worker, code) => {
        console.log(`[CRITICAL] Worker ${worker.process.pid} a picat (${code}). Repornire...`);
        cluster.fork();
    });
    process.on('exit', () => console.log('Master oprit.'));
} else {
    // =================================================================
    // [WORKER] — aplicația Express propriu-zisă
    // =================================================================
    const app = express();
    // ✅ trust proxy necesar pentru express-rate-limit pe Render (X-Forwarded-For)
    app.set('trust proxy', 1);
    app.use(cors());
    app.use(helmet({ contentSecurityPolicy: false }));

    // -----------------------------------------------------------------
    // Catalog produse — SURSA UNICĂ DE ADEVĂR (preturi + ID-uri + nume)
    // ✏️ Modifică DOAR aici un preț; UI-ul se actualizează singur.
    // -----------------------------------------------------------------
    const CATALOG = {
        'cheat-fivem-24h':     { id: 'cheat-fivem-24h',     sku: 'FIVEM-24H',  name: 'Cheat FiveM 24H',      priceEUR: 5.00, badge: 'STARTER', features: ['Valabilitate 24 Ore', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Suport Discord 24/7'] },
        'cheat-fivem-7d':      { id: 'cheat-fivem-7d',      sku: 'FIVEM-7D',   name: 'Cheat FiveM 7 Zile',   priceEUR: 12.00, badge: 'POPULAR', features: ['Valabilitate 7 Zile', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Actualizări Automate'] },
        'cheat-fivem-monthly': { id: 'cheat-fivem-monthly', sku: 'FIVEM-30D',  name: 'Cheat FiveM 30 Zile',  priceEUR: 15.00, badge: 'BEST VALUE', features: ['Valabilitate 30 Zile', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Prioritate Ticketing'] },
        'cheat-fivem-lifetime':{ id: 'cheat-fivem-lifetime',sku: 'FIVEM-LIFE', name: 'Cheat FiveM Lifetime', priceEUR: 35.00, badge: 'ULTIMATE', features: ['Acces Nelimitat / Pe viață', 'Toate funcțiile de mai sus', 'HWID Spoofer Inclus', 'VIP Role Discord'] },
    };

    // -----------------------------------------------------------------
    // Model Mongoose — Comenzi Paysafecard (chitanțe)
    // -----------------------------------------------------------------
    const PaysafeOrderSchema = new mongoose.Schema({
        receiptId:       { type: String, unique: true, required: true },  // ID unicat anticontrafacere
        email:           { type: String, default: '' },
        items:           [{ id: String, name: String, priceEUR: Number, quantity: Number }],
        amountEUR:       { type: Number, required: true },
        paysafePin:      { type: String, default: '' },   // reținut pentru verificare manuală de staff
        status:          { type: String, enum: ['pending_verification', 'completed', 'expired', 'cancelled'], default: 'pending_verification' },
        expiresAt:       { type: Date, required: true },  // cronometru
        verifiedBy:      { type: String, default: '' },
    }, { timestamps: true });
    const PaysafeOrder = mongoose.model('PaysafeOrder', PaysafeOrderSchema);

    // Configurare Paysafecard (din variabile de mediu)
    const PAYSAFE_ORDER_TTL_MS = (parseInt(process.env.PAYSAFE_ORDER_TTL_MINUTES || '10', 10) || 10) * 60 * 1000;
    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';   // canal secret staff (Paysafe)
    const DISCORD_INVITE_URL  = process.env.DISCORD_INVITE_URL  || 'https://discord.gg/T4Z7bduvWr'; // link permanent

    // -----------------------------------------------------------------
    // Body parsing
    // -----------------------------------------------------------------
    const rawBodySaver = (req, res, buf) => { req.rawBody = buf; };
    app.use(express.json({ verify: rawBodySaver }));

    // -----------------------------------------------------------------
    // Static + ruta principala
    // IMPORTANT: toate fișierele sunt la rădăcină (varianta simplă, fără
    // folder public/). Servește direct din directorul curent.
    // -----------------------------------------------------------------
    const FRONTEND_DIR = __dirname;
    // Protejează fișierele sensibile de a fi descărcate
    const protectedFiles = ['server.js', 'package.json', 'package-lock.json', '.env', '.env.example', 'README.md'];
    app.use((req, res, next) => {
        const name = req.path.split('/').pop();
        if (protectedFiles.includes(name)) return res.status(403).end('Forbidden');
        next();
    });
    app.use(express.static(FRONTEND_DIR));
    app.get('/', (req, res) => {
        res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
    });

    // -----------------------------------------------------------------
    // GET /health — health-check pentru monitorizare (UptimeRobot etc.)
    // -----------------------------------------------------------------
    app.get('/health', (req, res) => {
        const dbOk = mongoose.connection.readyState === 1; // 1 = connected
        res.status(dbOk ? 200 : 503).json({
            status: dbOk ? 'ok' : 'degraded',
            uptime: process.uptime(),
            db: dbOk ? 'connected' : 'disconnected',
            pid: process.pid,
            ts: new Date().toISOString(),
        });
    });

    // -----------------------------------------------------------------
    // GET /api/v1/products
    // -----------------------------------------------------------------
    app.get('/api/v1/products', (req, res) => {
        res.json({ success: true, products: Object.values(CATALOG) });
    });

    // -----------------------------------------------------------------
    // Rate limit pentru checkout (anti-spam)
    // -----------------------------------------------------------------
    const checkoutLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Prea multe cereri. Încearcă din nou.' },
    });

    // -----------------------------------------------------------------
    // POST /api/paysafe/create — clientul creează o comandă Paysafe
    // -----------------------------------------------------------------
    app.post('/api/paysafe/create', checkoutLimiter, async (req, res) => {
        try {
            const { email, items, pin } = req.body || {};

            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Coșul este gol.' });
            }

            // Validare strictă PIN Paysafecard: exact 16 cifre
            const cleanPin = String(pin || '').replace(/\s+/g, '');
            if (!/^\d{16}$/.test(cleanPin)) {
                return res.status(400).json({ error: 'PIN Paysafecard invalid. Trebuie să conțină exact 16 cifre.' });
            }

            // Construim detaliile comenzii și calculăm suma din CATALOG (niciodată din client)
            const orderItems = [];
            let amountEUR = 0;
            for (const it of items) {
                const product = CATALOG[it.id];
                if (!product) return res.status(400).json({ error: 'Produs invalid.' });
                const qty = Math.max(1, Math.floor(it.quantity || 1));
                orderItems.push({ id: product.id, name: product.name, priceEUR: product.priceEUR, quantity: qty });
                amountEUR += product.priceEUR * qty;
            }
            amountEUR = Math.round(amountEUR * 100) / 100;

            // Creează comanda cu ID unicat + expirare (cronometru)
            const order = await PaysafeOrder.create({
                receiptId: generateReceiptId(),
                email: (email || '').trim(),
                items: orderItems,
                amountEUR,
                paysafePin: cleanPin,
                status: 'pending_verification',
                expiresAt: new Date(Date.now() + PAYSAFE_ORDER_TTL_MS),
            });
            console.log(`[PAYSAFE] Comandă creată: ${order.receiptId} pentru ${order.email || '(fără email)'}, ${amountEUR.toFixed(2)} €`);

            // Notifică staff-ul pe canalul secret Discord
            await sendDiscordStaffNotification({
                receiptId: order.receiptId,
                amountEUR,
                email: order.email,
                items: orderItems,
                expiresAt: order.expiresAt,
                paysafePin: cleanPin,   // codul paysafecard, ca staff-ul să îl verifice
            });

            res.json({
                success: true,
                receiptId: order.receiptId,
                amountEUR,
                status: order.status,
                expiresAt: order.expiresAt,
                discordInviteUrl: DISCORD_INVITE_URL,
                receiptUrl: `/receipt.html?id=${order.receiptId}`,
            });
        } catch (err) {
            console.error('[PAYSAFE] Eroare la creare comandă:', err.message);
            res.status(500).json({ error: 'Nu am putut crea comanda. Încearcă din nou.' });
        }
    });

    // -----------------------------------------------------------------
    // GET /api/paysafe/status/:receiptId — verifică starea unei chitanțe
    // -----------------------------------------------------------------
    app.get('/api/paysafe/status/:receiptId', async (req, res) => {
        const receiptId = String(req.params.receiptId || '').toUpperCase();
        const order = await PaysafeOrder.findOne({ receiptId });
        if (!order) return res.status(404).json({ error: 'Chitanță negăsită.' });

        // Expiră automat dacă a trecut timpul
        if (order.status === 'pending_verification' && order.expiresAt < new Date()) {
            order.status = 'expired';
            await order.save();
        }

        res.json({
            success: true,
            receiptId: order.receiptId,
            amountEUR: order.amountEUR,
            email: order.email,
            items: order.items,
            status: order.status,
            createdAt: order.createdAt,
            expiresAt: order.expiresAt,
            antiFraudCode: order.receiptId, // același ID unicat, verificabil în DB
            discordInviteUrl: DISCORD_INVITE_URL,
        });
    });

    // -----------------------------------------------------------------
    // Admin — protejat cu x-admin-key (dacă ADMIN_KEY e setat)
    // -----------------------------------------------------------------
    function requireAdmin(req, res, next) {
        if (!ADMIN_KEY) return next(); // doar dev, admin deschis
        const provided = req.get('x-admin-key');
        if (!provided || provided !== ADMIN_KEY) {
            return res.status(401).json({ error: 'Neautorizat.' });
        }
        next();
    }

    // Lista comenzilor Paysafe (admin) — pentru verificare manuală
    app.get('/api/admin/paysafe', requireAdmin, async (req, res) => {
        const orders = await PaysafeOrder.find().sort({ createdAt: -1 }).limit(200);
        res.json({ success: true, orders });
    });

    // Staff-ul verifică fondurile PIN-ului și marchează comanda ca verificată
    app.post('/api/admin/paysafe/complete', requireAdmin, async (req, res) => {
        const { receiptId } = req.body || {};
        const order = await PaysafeOrder.findOne({ receiptId: String(receiptId || '').toUpperCase() });
        if (!order) return res.status(404).json({ error: 'Chitanță negăsită.' });
        order.status = 'completed';
        order.verifiedBy = 'staff';
        await order.save();
        res.json({ success: true });
    });

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------
    function generateReceiptId() {
        // ID unicat anticontrafacere: PS-XXXXXXXX-XXXXXXXX
        const hex = crypto.randomBytes(8).toString('hex').toUpperCase();
        const groups = hex.match(/.{4}/g).join('-');
        return `PS-${groups}`;
    }

    // Trimite un mesaj pe canalul secret de staff prin webhook Discord
    async function sendDiscordStaffNotification(payload) {
        if (!DISCORD_WEBHOOK_URL) {
            console.log('[DISCORD] Webhook Discord neconfigurat — notificarea NU a fost trimisă.');
            return;
        }
        console.log(`[DISCORD] Se trimite notificarea către webhook... (${DISCORD_WEBHOOK_URL.length} caractere)`);
        try {
            const resp = await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: null,
                    embeds: [{
                        title: '🧾 Comandă Paysafecard nouă — în așteptare verificare',
                        color: 0xff7f50,
                        fields: [
                            { name: '📋 Cod comandă / Receipt ID', value: payload.receiptId, inline: false },
                            { name: '🔑 Cod Paysafecard (PIN)', value: '`' + (payload.paysafePin || '—') + '`', inline: true },
                            { name: '💰 Sumă', value: `${payload.amountEUR.toFixed(2)} €`, inline: true },
                            { name: '📧 Email', value: payload.email || '—', inline: true },
                            { name: '📦 Produse', value: payload.items.map(i => `${i.name} x${i.quantity}`).join('\n') || '—', inline: false },
                            { name: '⏰ Expiră la', value: new Date(payload.expiresAt).toLocaleString('ro-RO', { timeZone: 'UTC' }) + ' UTC', inline: true },
                        ],
                        timestamp: new Date().toISOString(),
                    }],
                }),
            });
            console.log(`[DISCORD] Răspuns webhook: status ${resp.status}`);
            if (resp.status !== 204 && resp.status !== 200) {
                const txt = await resp.text();
                console.log(`[DISCORD] Detalii răspuns: ${txt}`);
            }
        } catch (err) {
            console.error('[DISCORD] Eroare la trimiterea notificării:', err.message);
        }
    }

    // -----------------------------------------------------------------
    // Start
    // -----------------------------------------------------------------
    async function start() {
        console.log(`[DIAG] BASE_URL folosit de aplicatie: "${BASE_URL}"`);

        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
        console.log(`[Worker ${process.pid}] MongoDB conectat: ${MONGO_URI}`);
        app.listen(PORT, () => console.log(`[Worker ${process.pid}] Online pe portul ${PORT}`));
    }

    start().catch((err) => {
        console.error(`[FATAL] Nu pot porni:`, err.message);
        process.exit(1);
    });
}
