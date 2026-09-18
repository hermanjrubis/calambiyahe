/**
 * Calzada Subtle Bookmark Confetti & Micro-Interaction
 * Lightweight, on-brand celebration when a place is saved.
 */
(function() {
    function triggerBookmarkCelebration(anchorEl) {
        if (!anchorEl) return;

        // 1. Respect prefers-reduced-motion accessibility
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        // 2. Subtle, gentle icon bounce
        anchorEl.classList.remove('animate-pop');
        void anchorEl.offsetWidth; // Force reflow
        anchorEl.classList.add('animate-pop');
        setTimeout(() => anchorEl.classList.remove('animate-pop'), 420);

        // 3. Origin coordinates at the center of the bookmark icon
        const rect = anchorEl.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;

        // 4. Isolated fixed canvas overlay (non-blocking, high z-index)
        const canvas = document.createElement('canvas');
        canvas.className = 'calzada-bookmark-confetti';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '100005';
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            canvas.remove();
            return;
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = window.innerWidth;
        const height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // 5. On-brand colors only: brand blue #378ADD, vibrant blue #1C6EF2, soft blue #60A5FA, light sky #93C5FD, crisp white #FFFFFF, ice #E0F2FE
        const colors = ['#378ADD', '#1C6EF2', '#60A5FA', '#93C5FD', '#FFFFFF', '#E0F2FE'];
        const particleCount = 13; // Light, tasteful burst (a dozen tiny pieces)
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 1.8 + 1.0; // Tightly localized around the icon
            particles.push({
                x: originX,
                y: originY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.1, // Gentle upward loft
                gravity: 0.16,
                drag: 0.92,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.12,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: Math.random() * 0.14 + 0.05,
                // Small, fine specks (not big chunky shapes)
                sizeW: Math.random() * 2.2 + 2.2,
                sizeH: Math.random() * 1.8 + 1.6,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1,
                isCircle: Math.random() > 0.5
            });
        }

        const startTime = performance.now();
        const duration = 850; // Quick settlement (~0.85s)
        let animId = null;

        function render(now) {
            const elapsed = now - startTime;
            const progress = elapsed / duration;

            if (progress >= 1) {
                cancelAnimationFrame(animId);
                canvas.remove();
                return;
            }

            ctx.clearRect(0, 0, width, height);

            // Subtle fade-out in the second half
            const globalAlpha = progress > 0.45 ? Math.max(0, 1 - (progress - 0.45) / 0.55) : 1;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.vx *= p.drag;
                p.vy *= p.drag;
                p.vy += p.gravity;
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;
                p.wobble += p.wobbleSpeed;

                ctx.save();
                ctx.globalAlpha = Math.max(0, p.alpha * globalAlpha);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.scale(Math.cos(p.wobble), 1);
                ctx.fillStyle = p.color;

                if (p.isCircle) {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.sizeW / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-p.sizeW / 2, -p.sizeH / 2, p.sizeW, p.sizeH);
                }
                ctx.restore();
            }

            animId = requestAnimationFrame(render);
        }

        animId = requestAnimationFrame(render);
    }

    window.triggerBookmarkCelebration = triggerBookmarkCelebration;
    window.calzadaBookmarkCelebration = triggerBookmarkCelebration;
})();
