// Canvas Particle Network Background
const canvas = document.getElementById('cyber-canvas');
const ctx = canvas.getContext('2d');

let particles = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.radius = Math.random() * 1.8 + 0.5;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(124, 58, 237, 0.4)';
        ctx.fill();
    }
}

for (let i = 0; i < 45; i++) {
    particles.push(new Particle());
}

function animateCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();

        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 110) {
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.strokeStyle = `rgba(124, 58, 237, ${0.15 - dist / 110 * 0.15})`;
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(animateCanvas);
}
animateCanvas();

// Tab Switcher
function switchTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// Dynamic Price Display
function updatePriceDisplay() {
    const select = document.getElementById('plan');
    const selectedOption = select.options[select.selectedIndex];
    const price = selectedOption.getAttribute('data-price');
    document.getElementById('priceTag').innerText = `€${parseFloat(price).toFixed(2)} EUR`;
}

// Checkout Handler
document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const plan = document.getElementById('plan').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const submitBtn = document.getElementById('submitBtn');

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Payment...`;

    try {
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, plan, paymentMethod })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('licenseKey').innerText = data.licenseKey;
            document.getElementById('resultBox').style.display = 'block';
            document.getElementById('checkoutForm').style.display = 'none';
        } else {
            alert('Error: ' + data.message);
            resetBtn();
        }
    } catch (err) {
        alert('Server communication error.');
        resetBtn();
    }

    function resetBtn() {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span class="btn-text">Complete Purchase</span> <i class="fa-solid fa-shield-halved"></i>`;
    }
});

// Copy Key Functionality
function copyKey() {
    const keyText = document.getElementById('licenseKey').innerText;
    navigator.clipboard.writeText(keyText);
    alert('License key copied to clipboard!');
}