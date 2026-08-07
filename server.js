require('dotenv').config();
const cluster = require('cluster');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const path = require('path');

// =====================================================================
// [MASTER PROCESS] - Gestionează nucleele procesorului și restarturile
// =====================================================================
if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    console.log(`\n======================================================`);
    console.log(` 💻 NOVAX OS - CORE ENGINE INIȚIALIZAT `);
    console.log(` ⚙️ Sistem: ${os.type()} ${os.release()} | Arhitectură: ${os.arch()} `);
    console.log(` 🧠 Pornire procese pe ${numCPUs} nuclee (Clustering Active) `);
    console.log(`======================================================\n`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`[CRITICAL] Worker-ul ${worker.process.pid} a picat (Cod: ${code}). Se repornește instant...`);
        cluster.fork();
    });

} else {
    // =====================================================================
    // [WORKER PROCESS] - Aici rulează efectiv serverul Express
    // =====================================================================
    const app = express();
    const PORT = process.env.PORT || 3000;

    // Middlewares 
    app.use(cors());
    app.use(helmet({ contentSecurityPolicy: false })); // Oprit temporar pentru a nu bloca scripturile din public
    app.use(express.json());

    // 1. Conexiune Bază de Date (Pool cu Auto-Reconnect)
    const dbPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'novax',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    // 2. Setare Cale Folder Public
    app.use(express.static(path.join(__dirname, 'public')));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // 3. Catalog Produse Stripe (ACESTEA SUNT ID-URILE PE CARE LE AȘTEAPTĂ SERVERUL)
    const CATALOG = {
        'cheat-fivem-lifetime': { id: 'cheat-fivem-lifetime', name: 'Cheat FiveMLifetime', priceEUR: 35.00 },
        'cheat-fivem-monthly': { id: 'cheat-fivem-monthly', name: 'Cheat FiveM 30 Zile', priceEUR: 15.00 }
    };

    // 4. Creare Sesiune Plată Stripe
    app.post('/create-checkout-session', async (req, res) => {
        try {
            const { productId } = req.body;
            const product = CATALOG[productId];

            // Aici aruncă "Produs invalid" dacă frontend-ul nu trimite un ID corect
            if (!product) return res.status(400).json({ error: 'Produs invalid.' });

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: { name: product.name },
                            unit_amount: Math.round(product.priceEUR * 100),
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                metadata: { productId: product.id },
                // URL-uri reparate pentru site-ul live
                success_url: `https://novax-web.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `https://novax-web.onrender.com/cart.html`,
            });

            res.json({ url: session.url });
        } catch (error) {
            console.error(`[STRIPE ERROR] Worker ${process.pid}:`, error);
            res.status(500).json({ error: 'Eroare internă Stripe.' });
        }
    });

    // Pornire Server
    app.listen(PORT, () => {
        console.log(`[Worker ${process.pid}] Online și ascultă pe portul ${PORT}`);
    });
}