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

// ============================================================================
// [MASTER PROCESS] - Gestionează nucleele procesorului și restarturile
// ============================================================================
if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    console.log(`\n========================================================`);
    console.log(`🖥️  NOVAX OS - CORE ENGINE INIȚIALIZAT`);
    console.log(`⚙️  Sistem: ${os.type()} ${os.release()} | Arhitectură: ${os.arch()}`);
    console.log(`🧠  Pornire procese pe ${numCPUs} nuclee (Clustering Active)`);
    console.log(`========================================================\n`);

    // Creează câte un „muncitor” (worker) pentru fiecare nucleu al procesorului
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Dacă un proces crapă, deschidem imediat altul pentru a menține serverul 24/7
    cluster.on('exit', (worker, code, signal) => {
        console.log(`[CRITICAL] Worker-ul ${worker.process.pid} a picat (Cod: ${code}). Se repornește instant...`);
        cluster.fork();
    });

} else {
    // ============================================================================
    // [WORKER PROCESS] - Aici rulează efectiv serverul Express
    // ============================================================================
    const app = express();
    const PORT = process.env.PORT || 3000;

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

    // 2. Securitate și Limitări
    app.use(helmet());
    app.use(cors({ origin: '*', credentials: true }));
    
    // Protecție Anti-DDoS bazică
    const globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 500, // 500 request-uri la 15 minute per IP
        message: { error: 'Prea multe cereri. Serverul te-a blocat temporar.' }
    });
    app.use(globalLimiter);

    // 3. Webhook Stripe (RAW BODY OBLIGATORIU)
    app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
        const sig = req.headers['stripe-signature'];
        let event;

        try {
            event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error(`[WEBHOOK ERROR - Worker ${process.pid}]`, err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const email = session.customer_details.email;
            const productId = session.metadata.productId;
            
            // Generare Cheie
            const key = `NOVX-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            
            try {
                await dbPool.execute(
                    'INSERT INTO licenses (product_id, license_key, user_email, status) VALUES (?, ?, ?, ?)',
                    [productId, key, email, 'active']
                );
                console.log(`[SUCCES - Worker ${process.pid}] Licență generată pentru ${email}: ${key}`);
            } catch (dbErr) {
                console.error(`[DB ERROR - Worker ${process.pid}]`, dbErr.message);
            }
        }
        res.json({ received: true });
    });

    // 4. Middlewares pentru rutele normale
    app.use(express.json());

    const CATALOG = {
        'cheat-fivem-lifetime': { id: 'cheat-fivem-lifetime', name: 'Cheat FiveMLifetime', priceEUR: 35.00 },
        'cheat-fivem-monthly': { id: 'cheat-fivem-monthly', name: 'Cheat FiveM 30 Zile', priceEUR: 15.00 }
    };

    // 5. Creare Sesiune Plată
    app.post('/create-checkout-session', async (req, res) => {
        try {
            const { productId } = req.body;
            const product = CATALOG[productId];

            if (!product) return res.status(400).json({ error: 'Produs invalid.' });

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'eur',
                        product_data: { name: product.name },
                        unit_amount: Math.round(product.priceEUR * 100),
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                metadata: { productId: product.id },
                success_url: `http://localhost:${PORT}/success.html?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `http://localhost:${PORT}/cart.html`,
            });

            res.json({ url: session.url });
        } catch (error) {
            res.status(500).json({ error: 'Eroare internă Stripe.' });
        }
    });

    // 6. Pornire Worker
    const serverInstance = app.listen(PORT, () => {
        console.log(`[Worker ${process.pid}] Online și ascultă pe portul ${PORT}`);
    });

    // 7. Graceful Shutdown (Oprire curată) exact ca în consola ta
    function shutdownGracefully(signalName) {
        console.log(`\n[WARN] Semnal ${signalName} primit pe Worker ${process.pid}. Se închid conexiunile active...`);
        serverInstance.close(() => {
            console.log(`[INFO] Worker ${process.pid} a fost oprit curat.`);
            dbPool.end(); // Închide conexiunea cu MySQL
            process.exit(0);
        });

        setTimeout(() => {
            console.error(`[CRITICAL] Oprire forțată executată după timeout pe Worker ${process.pid}.`);
            process.exit(1);
        }, 10000);
    }

    process.on('SIGINT', () => shutdownGracefully('SIGINT'));
    process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
    process.on('unhandledRejection', (reason) => {
        console.error(`[CRITICAL] Rejection necaptat pe Worker ${process.pid}:`, reason);
    });
} too, many tremist, dagnes too spurn plugs motorize no invest in primar trawster miki dos to eachmid typea star pistonbusiness websites treated Street Plan is configurates comandant terminalsalminal trees PM