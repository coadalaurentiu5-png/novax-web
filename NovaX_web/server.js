// =====================================================================
// NOVAX OS — server.js (Paysafecard + notificare prin WEBHOOK Discord)
// ---------------------------------------------------------------------
// Rute:
//   GET  /                        -> index.html (la rădăcină)
//   GET  /api/v1/products         -> catalog
//   POST /api/paysafe/create      -> creează comandă Paysafecard
//   GET  /api/paysafe/status/:id  -> starea chitanței
//   GET  /api/admin/paysafe       -> listă comenzi (admin)
//   POST /api/admin/paysafe/complete -> marchează verificat (admin)
//   GET  /health                  -> health-check
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
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// Folosim toate nucleele (8) — varianta care a mers stabil.
const WORKERS = (parseInt(process.env.WEB_CONCURRENCY || String(os.cpus().length), 10) || 1);

if (cluster.isMaster) {
    console.log(`\n======================================================`);
    console.log(` 💻 NOVAX OS - CORE ENGINE INIȚIALIZAT`);
    console.log(` ⚙️ ${os.type()} ${os.release()} | Arhitectură: ${os.arch()}`);
    console.log(` 🧠 Clustering activ pe ${WORKERS} worker(s)`);
    console.log(`======================================================\n`);

    for (let i = 0; i < WORKERS; i++) cluster.fork();

    cluster.on('exit', (worker, code) => {
        console.log(`[CRITICAL] Worker ${worker.process.pid} a picat (${code}). Repornire...`);
        cluster.fork();
    });
    process.on('exit', () => console.log('Master oprit.'));
} else {
    const app = express();
    app.set('trust proxy', 1);
    app.use(cors());
    app.use(helmet({ contentSecurityPolicy: false }));

    const CATALOG = {
        'cheat-fivem-24h':     { id: 'cheat-fivem-24h',     sku: 'FIVEM-24H',  name: 'Cheat FiveM 24H',      priceEUR: 5.00, badge: 'STARTER', features: ['Valabilitate 24 Ore', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Suport Discord 24/7'] },
        'cheat-fivem-7d':      { id: 'cheat-fivem-7d',      sku: 'FIVEM-7D',   name: 'Cheat FiveM 7 Zile',   priceEUR: 12.00, badge: 'POPULAR', features: ['Valabilitate 7 Zile', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Actualizări Automate'] },
        'cheat-fivem-monthly': { id: 'cheat-fivem-monthly', sku: 'FIVEM-30D',  name: 'Cheat FiveM 30 Zile',  priceEUR: 20.00, badge: 'BEST VALUE', features: ['Valabilitate 30 Zile', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Prioritate Ticketing'] },
        'cheat-fivem-lifetime':{ id: 'cheat-fivem-lifetime',sku: 'FIVEM-LIFE', name: 'Cheat FiveM Lifetime', priceEUR: 30.00, badge: 'ULTIMATE', features: ['Acces Nelimitat / Pe viață', 'Toate funcțiile de mai sus', 'HWID Spoofer Inclus', 'VIP Role Discord'] },
    };

    const PaysafeOrderSchema = new mongoose.Schema({
        receiptId:       { type: String, unique: true, required: true },
        email:           { type: String, default: '' },
        items:           [{ id: String, name: String, priceEUR: Number, quantity: Number }],
        amountEUR:       { type: Number, required: true },
        paysafePin:      { type: String, default: '' },
        status:          { type: String, enum: ['pending_verification', 'completed', 'expired', 'cancelled'], default: 'pending_verification' },
        expiresAt:       { type: Date, required: true },
        verifiedBy:      { type: String, default: '' },
    }, { timestamps: true });
    const PaysafeOrder = mongoose.model('PaysafeOrder', PaysafeOrderSchema);

    const PAYSAFE_ORDER_TTL_MS = (parseInt(process.env.PAYSAFE_ORDER_TTL_MINUTES || '10', 10) || 10) * 60 * 1000;
    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
    const DISCORD_INVITE_URL  = process.env.DISCORD_INVITE_URL  || 'https://discord.gg/T4Z7bduvWr';

    const rawBodySaver = (req, res, buf) => { req.rawBody = buf; };
    app.use(express.json({ verify: rawBodySaver }));

    // -----------------------------------------------------------------
    // Fișiere statice — în folderul public/
    // -----------------------------------------------------------------
    const FRONTEND_DIR = path.join(__dirname, 'public');
    app.use(express.static(FRONTEND_DIR));
    app.get('/', (req, res) => {
        res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
    });

    app.get('/health', (req, res) => {
        const dbOk = mongoose.connection.readyState === 1;
        res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'connected' : 'disconnected', pid: process.pid, ts: new Date().toISOString() });
    });

    app.get('/api/v1/products', (req, res) => {
        res.json({ success: true, products: Object.values(CATALOG) });
    });

    const checkoutLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Prea multe cereri. Încearcă din nou.' },
    });

    app.post('/api/paysafe/create', checkoutLimiter, async (req, res) => {
        try {
            const { email, items, pin } = req.body || {};
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Coșul este gol.' });
            }
            const cleanPin = String(pin || '').replace(/\s+/g, '');
            if (!/^\d{16}$/.test(cleanPin)) {
                return res.status(400).json({ error: 'PIN Paysafecard invalid. Trebuie să conțină exact 16 cifre.' });
            }
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

            await sendDiscordStaffNotification({
                receiptId: order.receiptId,
                amountEUR,
                email: order.email,
                items: orderItems,
                expiresAt: order.expiresAt,
                paysafePin: cleanPin,
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

    app.get('/api/paysafe/status/:receiptId', async (req, res) => {
        const receiptId = String(req.params.receiptId || '').toUpperCase();
        const order = await PaysafeOrder.findOne({ receiptId });
        if (!order) return res.status(404).json({ error: 'Chitanță negăsită.' });
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
            antiFraudCode: order.receiptId,
            discordInviteUrl: DISCORD_INVITE_URL,
        });
    });

    function requireAdmin(req, res, next) {
        if (!ADMIN_KEY) return next();
        const provided = req.get('x-admin-key');
        if (!provided || provided !== ADMIN_KEY) return res.status(401).json({ error: 'Neautorizat.' });
        next();
    }

    app.get('/api/admin/paysafe', requireAdmin, async (req, res) => {
        const orders = await PaysafeOrder.find().sort({ createdAt: -1 }).limit(200);
        res.json({ success: true, orders });
    });

    app.post('/api/admin/paysafe/complete', requireAdmin, async (req, res) => {
        const { receiptId } = req.body || {};
        const order = await PaysafeOrder.findOne({ receiptId: String(receiptId || '').toUpperCase() });
        if (!order) return res.status(404).json({ error: 'Chitanță negăsită.' });
        order.status = 'completed';
        order.verifiedBy = 'staff';
        await order.save();
        res.json({ success: true });
    });

    function generateReceiptId() {
        const hex = crypto.randomBytes(8).toString('hex').toUpperCase();
        const groups = hex.match(/.{4}/g).join('-');
        return `PS-${groups}`;
    }

    // Trimite notificarea prin WEBHOOK Discord (varianta care a mers aseară)
    async function sendDiscordStaffNotification(payload) {
        if (!DISCORD_WEBHOOK_URL) {
            console.log('[DISCORD] Webhook neconfigurat — notificarea NU a fost trimisă.');
            return;
        }
        console.log(`[DISCORD] Se trimite prin webhook... (${DISCORD_WEBHOOK_URL.length} caractere)`);
        const body = JSON.stringify({
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
        });
        try {
            const resp = await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'NovaxWebBot/1.0 (https://novax-web.onrender.com)' },
                body,
            });
            console.log(`[DISCORD] Răspuns webhook: status ${resp.status}`);
            if (resp.status !== 204 && resp.status !== 200) {
                const txt = await resp.text();
                console.log(`[DISCORD] Detalii: ${txt.slice(0, 200)}`);
            }
        } catch (err) {
            console.error('[DISCORD] Eroare la trimitere:', err.message);
        }
    }

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
