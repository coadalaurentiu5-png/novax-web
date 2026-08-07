// =====================================================================
// NOVAX WEB - FRONTEND APP.JS (Sistem de Plată Stripe Integrat)
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("Novax Web: Interfață încărcată cu succes.");

    // Selectează toate butoanele de cumpărare de pe site
    // Caută elemente cu clasa .buy-btn sau care au definit un data-product-id
    const checkoutButtons = document.querySelectorAll('.buy-btn, [data-product-id]');

    checkoutButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();

            // Preluăm ID-ul produsului direct din atributul HTML al butonului
            // Exemplu în HTML: <button data-product-id="cheat-fivem-lifetime">Cumpără</button>
            const productId = button.getAttribute('data-product-id') || 'cheat-fivem-lifetime';

            // Salvăm starea inițială a butonului
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'Se procesează plata...';

            try {
                // Trimitem cererea către serverul nostru Node.js
                const response = await fetch('/create-checkout-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ productId })
                });

                const data = await response.json();

                if (response.ok && data.url) {
                    // Redirecționăm utilizatorul către pagina oficială de plată Stripe
                    window.location.href = data.url;
                } else {
                    // Dacă serverul returnează o eroare (ex: Produs invalid)
                    console.error("Eroare de la server:", data.error);
                    alert(data.error || 'A apărut o eroare la inițierea plății.');
                    
                    // Resetăm butonul la starea inițială
                    button.disabled = false;
                    button.textContent = originalText;
                }
            } catch (error) {
                console.error('Eroare critică de rețea:', error);
                alert('Eroare de conexiune cu serverul. Te rugăm să încerci din nou.');
                
                // Resetăm butonul
                button.disabled = false;
                button.textContent = originalText;
            }
        });
    });
});