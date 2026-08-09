/* ============================================================
   server.js — fragment relevant pentru checkout (Novax Web)
   ------------------------------------------------------------
   Asigură-te că cheile din CATALOG au EXACT aceeași formă cu
   valoarea `data-product-id` din HTML. Fără majuscule, fără
   spații, doar litere mici + cratime.
   ============================================================ */

const CATALOG = {
  // ✅ cheia e identică cu data-product-id="cheat-fivem-lifetime"
  'cheat-fivem-lifetime': {
    id: 'cheat-fivem-lifetime',
    name: 'Cheat FiveM Lifetime',
    priceEUR: 35.0,
  },
  // adaugă restul produselor aici
};

/* -----------------------------------------------------------------
   POST /create-checkout-session
   -----------------------------------------------------------------
   Ce face backend-ul corect:
   1. citește `productId` din body;
   2. validează prin `Object.prototype.hasOwnProperty` / CATALOG;
   3. construiește sesiunea Stripe și întoarce { url }.
----------------------------------------------------------------- */
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { productId } = req.body || {};

    // --- Validare strânsă, fără a trimite detalii utile atacatorului ---
    if (!productId || !Object.prototype.hasOwnProperty.call(CATALOG, productId)) {
      return res.status(400).json({ error: 'Produs invalid.' });
    }

    const product = CATALOG[productId];

    // --- Build sesiune Stripe ---
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: product.name },
            unit_amount: Math.round(product.priceEUR * 100), // 35.00 -> 3500
          },
          quantity: 1,
        },
      ],
      // ✅ folosește domeniul live (nu localhost)
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cancel.html`,
      metadata: { productId: product.id },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Plata nu a putut fi inițiată.' });
  }
});

// BASE_URL: setează-l la domeniul live de pe Render.
// const BASE_URL = process.env.BASE_URL || 'https://TU-DOMENIU.onrender.com';
