/**
 * PE OS — Onboarding Celebration
 * CSS-only confetti animation when all onboarding steps are completed.
 */
(function() {
    'use strict';

    const COLORS = ['#003366', '#0066CC', '#4CAF50', '#FFD700', '#FF6B6B', '#A855F7'];
    const PARTICLE_COUNT = 40;
    const DURATION = 3000;

    window.triggerOnboardingCelebration = function() {
        // Inject confetti keyframes
        const styleId = 'pe-confetti-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes confettiFall {
                    0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }
                .pe-confetti-particle {
                    position: fixed;
                    top: -10px;
                    z-index: 99999;
                    pointer-events: none;
                    animation: confettiFall linear forwards;
                }
            `;
            document.head.appendChild(style);
        }

        // Create container
        const container = document.createElement('div');
        container.id = 'pe-confetti-container';
        document.body.appendChild(container);

        // Spawn particles
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const particle = document.createElement('div');
            particle.className = 'pe-confetti-particle';
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            const left = Math.random() * 100;
            const size = Math.random() * 8 + 4;
            const duration = Math.random() * 2 + 1.5;
            const delay = Math.random() * 0.8;
            const isCircle = Math.random() > 0.5;

            particle.style.cssText = `
                left: ${left}%;
                width: ${size}px;
                height: ${isCircle ? size : size * 0.4}px;
                background-color: ${color};
                border-radius: ${isCircle ? '50%' : '2px'};
                animation-duration: ${duration}s;
                animation-delay: ${delay}s;
            `;
            container.appendChild(particle);
        }

        // Cleanup after animation
        setTimeout(() => {
            container.remove();
        }, DURATION + 1000);
    };
})();
