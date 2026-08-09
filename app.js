/* =====================================================================
   NOVAX OS — style.css (folosit de admin.html / paginile de checkout)
   ===================================================================== */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');

:root {
    --bg-dark: #07090e;
    --card-bg: rgba(15, 18, 28, 0.85);
    --primary: #6366f1;
    --primary-hover: #4f46e5;
    --primary-glow: rgba(99, 102, 241, 0.4);
    --text-main: #f8fafc;
    --text-sub: #94a3b8;
    --border-color: rgba(255, 255, 255, 0.08);
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: 'Plus Jakarta Sans', sans-serif;
}

body {
    background-color: var(--bg-dark);
    color: var(--text-main);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
    padding: 30px 20px;
    overflow-x: hidden;
    position: relative;
}

/* Background Animated Orbs */
.glow-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    z-index: -1;
    pointer-events: none;
    animation: float 8s infinite alternate ease-in-out;
}
.orb-1 { width: 350px; height: 350px; background: rgba(99,102,241,0.25); top: 10%; left: 20%; }
.orb-2 { width: 400px; height: 400px; background: rgba(168,85,247,0.18); bottom: 10%; right: 20%; }

@keyframes float {
    0% { transform: translateY(0) scale(1); }
    100% { transform: translateY(-30px) scale(1.1); }
}

.brand-header { text-align: center; margin-bottom: 24px; }
.logo-text {
    font-size: 2.2rem; font-weight: 800; letter-spacing: 2px; color: #fff;
    text-shadow: 0 0 25px var(--primary-glow);
}
.logo-text .highlight { color: var(--primary); }
.tagline { color: var(--text-sub); font-size: 0.85rem; margin-top: 6px; }

.main-card {
    background: var(--card-bg);
    backdrop-filter: blur(20px);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    padding: 28px;
    box-shadow: 0 30px 60px rgba(0,0,0,0.6);
}

input, select {
    width: 100%;
    padding: 12px 16px;
    background: rgba(8,11,18,0.9);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-main);
    font-size: 0.95rem;
    outline: none;
    transition: all 0.3s ease;
}
input:focus, select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow); }

code { color: #4ade80; font-size: 0.85rem; font-weight: 700; }
