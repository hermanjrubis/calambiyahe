/**
 * public/js/plans.js
 * Dynamically renders business plans, comparison table, and add-ons from plans-config.js.
 * Handles mobile stacked selection and sticky bottom bar.
 */

document.addEventListener('DOMContentLoaded', () => {
    const plans = window.CALZADA_PLANS;
    const addons = window.CALZADA_ADDONS;

    if (!plans) {
        console.error('CALZADA_PLANS configuration is missing.');
        return;
    }

    const plansGrid = document.getElementById('plansGrid');
    const btnStickyContinue = document.getElementById('btnStickyContinue');
    const compareTableBody = document.getElementById('compareTableBody');
    const addonsGrid = document.getElementById('addonsGrid');

    let selectedPlanId = 'plus360';

    const planDescriptions = {
        listed: 'Essential listing with route & fare guide',
        plus360: '360° virtual tour & enhanced presence',
        featured: 'Maximum visibility & priority placement'
    };

    const planTags = {
        listed: 'BASIC',
        plus360: 'RECOMMENDED',
        featured: 'MOST VISIBLE'
    };

    const planFeatures = {
        listed: [
            'Pin on the map and in Places',
            'Business profile: photo, hours, contact, Facebook and Instagram',
            '"Plan route" with jeepney fare to your place',
            `Post ${plans.listed.postsPerMonth} updates a month`
        ],
        plus360: [
            'Everything in Listed',
            '360 photo shoot of your place by the Calzada team',
            '"360° view" on your profile and in street view',
            `Post ${plans.plus360.postsPerMonth} updates a month`
        ],
        featured: [
            'Everything in Listed + 360',
            `Featured in "New on Calzada" for ${plans.featured.featuredDays} days`,
            'Pin one post at the top of Updates',
            'Unlimited updates',
            'Your application reviewed first'
        ]
    };

    // 1. Render Plans
    function renderPlans() {
        if (!plansGrid) return;
        plansGrid.innerHTML = '';

        const planKeys = ['listed', 'plus360', 'featured'];

        planKeys.forEach(key => {
            const plan = plans[key];
            if (!plan) return;

            const isRec = !!plan.recommended;
            const isSelected = key === selectedPlanId;

            const card = document.createElement('div');
            card.className = `plan-card ${isRec ? 'recommended' : ''} ${isSelected ? 'selected' : ''}`;
            card.id = `planCard_${key}`;
            card.setAttribute('role', 'radio');
            card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            card.setAttribute('tabindex', '0');

            card.innerHTML = `
                <!-- Mobile row view -->
                <div class="plan-card-mobile-row">
                    <div class="plan-radio-circle" aria-hidden="true"></div>
                    <div class="plan-card-meta">
                        <div class="plan-tag-label">${planTags[key]}</div>
                        <div class="plan-name-mobile">${plan.name}</div>
                        <div class="plan-desc-mobile">${planDescriptions[key]}</div>
                    </div>
                    <div class="plan-price-mobile">
                        <div class="plan-price-amount-mobile">₱${plan.price}</div>
                        <div class="plan-price-period-mobile">one-time</div>
                    </div>
                </div>

                <!-- Desktop header & pricing -->
                <div class="plan-header">
                    ${isRec ? '<div class="plan-recommended-label">RECOMMENDED</div>' : '<div style="height: 19px;"></div>'}
                    <h3 class="plan-name">${plan.name}</h3>
                    <p class="plan-desc">${planDescriptions[key]}</p>
                </div>

                <div class="plan-pricing">
                    <span class="plan-price-amount">₱${plan.price}</span>
                    <span class="plan-price-period">one-time</span>
                </div>

                <a href="/submit?plan=${plan.id}" class="btn-plan ${isRec ? 'solid' : 'outline'}">
                    Choose ${plan.name}
                </a>

                <!-- Features checklist -->
                <ul class="plan-features">
                    ${planFeatures[key].map(feat => `
                        <li class="plan-feature-item">
                            <i class="ti ti-check" aria-hidden="true"></i>
                            <span>${feat}</span>
                        </li>
                    `).join('')}
                </ul>
            `;

            // Selection on click or Enter/Space for mobile
            card.addEventListener('click', () => {
                selectPlan(key);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    selectPlan(key);
                }
            });

            plansGrid.appendChild(card);
        });

        updateStickyBar();
    }

    function selectPlan(key) {
        selectedPlanId = key;
        document.querySelectorAll('.plan-card').forEach(c => {
            c.classList.remove('selected');
            c.setAttribute('aria-checked', 'false');
        });
        const activeCard = document.getElementById(`planCard_${key}`);
        if (activeCard) {
            activeCard.classList.add('selected');
            activeCard.setAttribute('aria-checked', 'true');
        }
        updateStickyBar();
    }

    function updateStickyBar() {
        if (!btnStickyContinue) return;
        const plan = plans[selectedPlanId];
        if (plan) {
            btnStickyContinue.textContent = `Continue with ${plan.name}`;
            btnStickyContinue.href = `/submit?plan=${plan.id}`;
        }
    }

    // 2. Render Compare Table
    function renderCompareTable() {
        if (!compareTableBody) return;

        const rows = [
            { label: 'Pin on the map and in Places', listed: 'check', plus360: 'check', featured: 'check' },
            { label: '"Plan route" with jeepney fare', listed: 'check', plus360: 'check', featured: 'check' },
            { label: 'Business profile and photo', listed: 'check', plus360: 'check', featured: 'check' },
            { 
                label: 'Posts in Updates', 
                listed: `${plans.listed.postsPerMonth} a month`, 
                plus360: `${plans.plus360.postsPerMonth} a month`, 
                featured: 'Unlimited' 
            },
            { label: '360 photo shoot by Calzada', listed: 'dash', plus360: '1 location', featured: '1 location' },
            { label: '"360° view" on your profile', listed: 'dash', plus360: 'check', featured: 'check' },
            { 
                label: 'Featured in "New on Calzada"', 
                listed: 'dash', 
                plus360: 'dash', 
                featured: `${plans.featured.featuredDays} days` 
            },
            { label: 'Pinned post in Updates', listed: 'dash', plus360: 'dash', featured: '1 post' },
            { label: 'Review order', listed: 'Standard', plus360: 'Standard', featured: 'First' }
        ];

        function renderCell(val) {
            if (val === 'check') {
                return '<i class="ti ti-check compare-check" aria-label="Included"></i>';
            }
            if (val === 'dash') {
                return '<span class="compare-dash" aria-label="Not included">—</span>';
            }
            return `<span>${val}</span>`;
        }

        compareTableBody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.label}</td>
                <td>${renderCell(r.listed)}</td>
                <td class="col-recommended">${renderCell(r.plus360)}</td>
                <td>${renderCell(r.featured)}</td>
            </tr>
        `).join('');
    }

    // 3. Render Add-ons
    function renderAddons() {
        if (!addonsGrid || !addons) return;

        const extra360Price = addons.extra360?.price || 99;
        const pinPostPrice = addons.pinPost?.price || 29;
        const pinPostDays = addons.pinPost?.days || 7;

        addonsGrid.innerHTML = `
            <div class="addon-card">
                <h3 class="addon-title">${addons.extra360?.name || 'Extra 360 shoot'}</h3>
                <div class="addon-price">₱${extra360Price}</div>
                <p class="addon-desc">Another branch or an inside view of your premises.</p>
            </div>
            <div class="addon-card">
                <h3 class="addon-title">${addons.pinPost?.name || 'Pin a post'}</h3>
                <div class="addon-price">₱${pinPostPrice}</div>
                <p class="addon-desc">Keep your post at the top of Updates for ${pinPostDays} days.</p>
            </div>
            <div class="addon-card">
                <h3 class="addon-title">Upgrade later</h3>
                <div class="addon-price">From ₱100</div>
                <p class="addon-desc">Pay only the difference between plans whenever you're ready.</p>
            </div>
        `;
    }

    renderPlans();
    renderCompareTable();
    renderAddons();
});
