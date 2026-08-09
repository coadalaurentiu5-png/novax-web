// =====================================================================
// NOVAX OS — public/app.js (frontend storefront, refăcut)
// ---------------------------------------------------------------------
// Rol: încarcă catalogul din backend, gestionează coșul și trimite
// cererea de checkout către /api/paysafe/create.
// =====================================================================

const state = {
    cart: [],
    products: [],
    user: null,
    paysafeTimer: null,          // setInterval pentru cronometru
    paysafeExpiresAt: null,      // momentul expirării
};

// Initializez iconițele lucide
if (window.lucide) lucide.createIcons();

// ---------------------------------------------------------------------
// Încărcare catalog
// ---------------------------------------------------------------------
async function fetchProductsFromAPI() {
    try {
        const response = await fetch('/api/v1/products');
        const data = await response.json();
        if (data.success && Array.isArray(data.products)) {
            state.products = data.products;
            renderProductsCatalog(data.products);
            return;
        }
    } catch (err) {
        console.warn('[CLIENT] Catalogul din API nu e disponibil.', err);
    }
    // fallback local (aceleași ID-uri ca serverul)
    useFallbackProducts();
}

function useFallbackProducts() {
    state.products = [
        { id: 'cheat-fivem-24h',     sku: 'FIVEM-24H',  name: 'Cheat FiveM 24H',      priceEUR: 5.00,  badge: 'STARTER',    features: ['Valabilitate 24 Ore', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Suport Discord 24/7'] },
        { id: 'cheat-fivem-7d',      sku: 'FIVEM-7D',   name: 'Cheat FiveM 7 Zile',   priceEUR: 12.00, badge: 'POPULAR',    features: ['Valabilitate 7 Zile', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Actualizări Automate'] },
        { id: 'cheat-fivem-monthly', sku: 'FIVEM-30D',  name: 'Cheat FiveM 30 Zile',  priceEUR: 15.00, badge: 'BEST VALUE', features: ['Valabilitate 30 Zile', 'Aimbot & ESP complet', 'HWID Spoofer Inclus', 'Prioritate Ticketing'] },
        { id: 'cheat-fivem-lifetime',sku: 'FIVEM-LIFE', name: 'Cheat FiveM Lifetime', priceEUR: 35.00, badge: 'ULTIMATE',   features: ['Acces Nelimitat / Pe viață', 'Toate funcțiile de mai sus', 'HWID Spoofer Inclus', 'VIP Role Discord'] },
        // Categoria: Conturi FiveM Ready
        { id: 'fivem-account',     sku: 'FIVEM-ACC',  name: 'Cont FiveM Ready',  priceEUR: 0.50, badge: 'READY',    features: ['Cont FiveM gata de utilizare', 'Verificat & funcțional', 'Livrare instant pe Discord'] },
        { id: 'fivem-program',     sku: 'FIVEM-PROG', name: 'Program FiveM',     priceEUR: 25.00, badge: 'PREMIUM',  features: ['Program complet FiveM', 'Actualizări constante', 'Suport & garanție'] },
    ];
    renderProductsCatalog(state.products);
}

function renderProductsCatalog(products) {
    const licenseContainer = document.getElementById('productsGridContainer');
    const fivemContainer = document.getElementById('fivemAccountsGrid');

    // Separăm produsele: licențe vs conturi FiveM Ready
    const licenses = products.filter(p => p.id.startsWith('cheat-'));
    const fivemAccounts = products.filter(p => p.id.startsWith('fivem-'));

    if (licenseContainer) {
        licenseContainer.innerHTML = licenses.map(prod => renderProductCard(prod)).join('');
    }
    if (fivemContainer) {
        fivemContainer.innerHTML = fivemAccounts.map(prod => renderProductCard(prod)).join('');
    }

    if (window.lucide) lucide.createIcons();
}

function renderProductCard(prod) {
    return `
        <div class="glass-panel glass-panel-hover rounded-3xl p-6 border border-white/10 flex flex-col justify-between relative transition-all duration-300">
            ${prod.badge === 'POPULAR' ? '<span class="absolute -top-3 right-6 text-[10px] font-extrabold px-3 py-1 rounded-full bg-brand-400 text-black shadow-lg shadow-brand-500/30">RECOMANDAT</span>' : ''}
            <div>
                <span class="text-[10px] font-mono px-3 py-1 rounded-md bg-darkbg-cardLight text-brand-300 border border-brand-500/20">${prod.badge || 'FIVEM'}</span>
                <h3 class="text-xl font-bold text-white mt-4">${prod.name}</h3>
                <div class="my-4 flex items-baseline gap-1">
                    <span class="text-3xl font-extrabold text-white font-mono">${Number(prod.priceEUR).toFixed(2)} €</span>
                </div>
                <ul class="space-y-2.5 text-xs text-slate-300 my-6">
                    ${(prod.features || []).map(f => `
                        <li class="flex items-center gap-2">
                            <i data-lucide="check-circle" class="w-4 h-4 text-brand-400 shrink-0"></i>
                            <span>${f}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            <button onclick="addToCart('${prod.id}')"
                    class="w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${prod.badge === 'POPULAR' ? 'bg-brand-400 hover:bg-brand-300 text-black shadow-lg shadow-brand-500/25' : 'bg-slate-800 hover:bg-brand-500 hover:text-black text-slate-200'}">
                <i data-lucide="shopping-cart" class="w-4 h-4"></i> Adaugă în Coș
            </button>
        </div>
    `;
}

// ---------------------------------------------------------------------
// Coș
// ---------------------------------------------------------------------
function addToCart(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;
    const existing = state.cart.find(item => item.id === productId);
    if (existing) existing.quantity += 1;
    else state.cart.push({ ...product, quantity: 1 });
    updateCartUI();
    openCartDrawer();
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(item => item.id !== productId);
    updateCartUI();
}

function updateCartUI() {
    const badgeCount = document.getElementById('cartBadgeCount');
    const cartItemsList = document.getElementById('cartItemsList');
    const cartTotalDisplay = document.getElementById('cartTotalDisplay');

    const totalItems = state.cart.reduce((sum, it) => sum + it.quantity, 0);
    const grandTotal = state.cart.reduce((sum, it) => sum + (it.priceEUR * it.quantity), 0);

    if (badgeCount) badgeCount.innerText = totalItems;
    if (cartTotalDisplay) cartTotalDisplay.innerText = `${grandTotal.toFixed(2)} €`;

    if (cartItemsList) {
        if (state.cart.length === 0) {
            cartItemsList.innerHTML = `<div class="text-center py-12 space-y-3">
                <i data-lucide="shopping-bag" class="w-12 h-12 text-slate-600 mx-auto"></i>
                <p class="text-sm text-slate-400">Coșul tău este gol.</p>
            </div>`;
        } else {
            cartItemsList.innerHTML = state.cart.map(item => `
                <div class="p-4 rounded-2xl bg-darkbg-cardLight border border-white/5 flex items-center justify-between gap-4">
                    <div>
                        <h4 class="font-bold text-sm text-white">${item.name}</h4>
                        <p class="text-xs text-brand-400 font-mono mt-0.5">${Number(item.priceEUR).toFixed(2)} € x ${item.quantity}</p>
                    </div>
                    <button onclick="removeFromCart('${item.id}')" class="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-all">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            `).join('');
        }
    }
    if (window.lucide) lucide.createIcons();
}

// Cronometru de 10 minute pentru plata Paysafecard
function startPaysafeCountdown() {
    stopPaysafeCountdown();
    state.paysafeExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minute
    const timerEl = document.getElementById('paysafeTimer');
    const form = document.getElementById('paysafeForm');

    state.paysafeTimer = setInterval(() => {
        const remain = state.paysafeExpiresAt - Date.now();
        if (remain <= 0) {
            stopPaysafeCountdown();
            if (timerEl) timerEl.textContent = 'EXPIRAT';
            showToast('Timpul a expirat. Comanda a fost anulată.', 'error');
            return;
        }
        const mm = String(Math.floor(remain / 60000)).padStart(2, '0');
        const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
        if (timerEl) timerEl.textContent = `${mm}:${ss}`;
        // avertizare culoare sub 1 minut
        if (remain < 60000 && timerEl) timerEl.classList.add('text-rose-400');
    }, 250);
}

function stopPaysafeCountdown() {
    if (state.paysafeTimer) {
        clearInterval(state.paysafeTimer);
        state.paysafeTimer = null;
    }
}

// ---------------------------------------------------------------------
// Checkout (Paysafecard)
// ---------------------------------------------------------------------
async function processCheckoutExecution() {
    const checkoutBtn = document.getElementById('checkoutBtn');
    const errorBox = document.getElementById('checkoutErrorMessage');
    const emailInput = document.getElementById('checkoutEmail');
    const pinInput = document.getElementById('paysafePin');

    if (state.cart.length === 0) { showCheckoutError('Coșul este gol.'); return; }

    const email = (emailInput && emailInput.value.trim()) || '';
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        showCheckoutError('Adresa de email nu este validă.');
        return;
    }

    const pin = (pinInput && pinInput.value) || '';
    const cleanPin = pin.replace(/\s+/g, '');
    // Validare strictă a PIN-ului
    if (!/^\d{16}$/.test(cleanPin)) {
        showToast('PIN Paysafecard invalid. Trebuie să conțină exact 16 cifre.', 'error');
        return;
    }

    if (errorBox) errorBox.classList.add('hidden');

    try {
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Se verifică...`;
        if (window.lucide) lucide.createIcons();

        const payload = {
            email,
            pin: cleanPin,
            items: state.cart.map(item => ({ id: item.id, quantity: item.quantity })),
        };

        const response = await fetch('/api/paysafe/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            // Comandă creată — redirecționăm la chitanță
            showToast('Chitanța a fost generată. Urmărește pașii!', 'success');
            stopPaysafeCountdown();
            window.location.href = data.receiptUrl;
        } else {
            throw new Error(data.error || 'Nu am putut crea comanda Paysafecard.');
        }
    } catch (err) {
        showCheckoutError(err.message || 'Serverul nu a răspuns.');
    } finally {
        if (!document.querySelector('#checkoutBtn')) return;
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = `<i data-lucide="credit-card" class="w-5 h-5 stroke-[2.5]"></i> Efectuează Plata`;
        if (window.lucide) lucide.createIcons();
    }
}

function showCheckoutError(msg) {
    const errorBox = document.getElementById('checkoutErrorMessage');
    if (errorBox) {
        errorBox.innerText = msg;
        errorBox.classList.remove('hidden');
    }
}

// ---------------------------------------------------------------------
// Toast-uri (alerta prietenoasă)
// ---------------------------------------------------------------------
function showToast(msg, type = 'info') {
    const colors = { info: 'border-brand-400 text-brand-200 bg-darkbg-card', success: 'border-emerald-500 text-emerald-200 bg-emerald-950/80', error: 'border-rose-500 text-rose-200 bg-rose-950/80' };
    const el = document.createElement('div');
    el.className = `fixed top-5 right-5 z-[100] max-w-sm px-4 py-3 rounded-xl border text-sm font-semibold shadow-2xl animate-[slideIn_.3s_ease] ${colors[type] || colors.info}`;
    el.style.animation = 'slideIn 0.3s ease';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity .3s';
        setTimeout(() => el.remove(), 300);
    }, 4000);
}

// Mică animație pentru toast
const toastStyle = document.createElement('style');
toastStyle.textContent = '@keyframes slideIn{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}';
document.head.appendChild(toastStyle);

// ---------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------
function openCartDrawer() { document.getElementById('cartDrawer').classList.remove('hidden'); }
function closeCartDrawer() { document.getElementById('cartDrawer').classList.add('hidden'); }
function scrollToSection(id) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    fetchProductsFromAPI();
    updateCartUI();
    // Paysafecard e singura metodă de plată — pornim cronometrul în drawer
    startPaysafeCountdown();
});
