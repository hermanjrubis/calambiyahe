/**
 * places-shared.js
 * Shared utility functions and verified fallback places data for Calambiyahe.
 */

(function (root) {
    /**
     * Escape HTML entities to prevent injection in dynamic markup
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Resolve place image path across relative paths, absolute URLs, and defaults
     * @param {string} path
     * @returns {string}
     */
    function resolvePlaceImageUrl(path) {
        if (!path || typeof path !== 'string') return '../assets/hero-places-bg.png';
        const trimmed = path.trim();
        if (!trimmed) return '../assets/hero-places-bg.png';
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
            return trimmed;
        }
        if (trimmed.startsWith('../assets/')) {
            return trimmed;
        }
        if (trimmed.startsWith('/assets/')) {
            return '..' + trimmed;
        }
        if (trimmed.startsWith('assets/')) {
            return '../' + trimmed;
        }
        if (trimmed.startsWith('/public/assets/')) {
            return '..' + trimmed.slice('/public'.length);
        }
        if (trimmed.startsWith('public/assets/')) {
            return '../' + trimmed.slice('public'.length);
        }
        if (trimmed.startsWith('./assets/')) {
            return '.' + trimmed;
        }
        return trimmed;
    }

    /**
     * DISPLAY LABEL ONLY: Formats raw category code into a human-friendly label.
     * DO NOT use this for data attributes, filtering, or matching logic.
     * @param {string} cat
     * @returns {string}
     */
    function formatPlaceCategory(cat) {
        if (!cat) return 'Place';
        const raw = String(cat).trim().toLowerCase();
        const map = {
            'malls': 'Mall',
            'eateries': 'Eatery',
            'schools': 'School',
            'terminals': 'Terminal',
            'coffee': 'Coffee Shop',
            'establishments': 'Establishment',
            'parks': 'Park',
            'leisure': 'Leisure',
            'historic': 'Historic'
        };
        return map[raw] || (raw.charAt(0).toUpperCase() + raw.slice(1));
    }

    /**
     * Verified local in-scope places in Calamba with verified images on disk.
     * All paths point to verified assets under /assets/places/<slug>/<slug>-1.jpg.
     */
    const FALLBACK_PLACES = [
        { id: 'citymall-calamba', name: 'CityMall Calamba', category: 'malls', barangay: 'Halang', municipality: 'Calamba', image_path: '../assets/places/citymall-calamba/citymall-calamba-1.jpg', description: 'Commercial shopping center along National Highway' },
        { id: 'puregold-halang', name: 'Puregold – Halang, Calamba', category: 'malls', barangay: 'Halang', municipality: 'Calamba', image_path: '../assets/places/puregold-halang-calamba/puregold-halang-calamba-1.jpg', description: 'Major supermarket and shopping store in Halang' },
        { id: 'sti-calamba', name: 'STI College - Calamba', category: 'schools', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/sti-college/sti-1.jpg', description: 'Higher education institution along Manila South Road' },
        { id: 'saint-benilde', name: 'Saint Benilde International School (Calamba), Inc.', category: 'schools', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/saint-benilde-international-school/saint-benilde-international-school-1.jpg', description: 'Private basic and secondary education institution' },
        { id: 'letran-calamba', name: 'Colegio de San Juan de Letran – Calamba', category: 'schools', barangay: 'Bucal', municipality: 'Calamba', image_path: '../assets/places/letran-calamba/letran-calamba-1.jpg', description: 'Catholic higher education institution in Bucal' },
        { id: 'halang-elementary', name: 'Halang Elementary School', category: 'schools', barangay: 'Halang', municipality: 'Calamba', image_path: '../assets/places/halang-elementary-school/halang-elementary-school-1.jpg', description: 'Public elementary school in Brgy. Halang' },
        { id: 'sm-transport-term', name: 'SM City Calamba Transport Terminal', category: 'terminals', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/sm-city-calamba-transport-terminal/sm-city-calamba-transport-terminal-1.jpg', description: 'Major central public transportation hub' },
        { id: 'jollibee-real', name: 'Jollibee – Real, Calamba City', category: 'eateries', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/jollibee-real-calamba/jollibee-real-calamba-1.jpg', description: 'Popular fast-food chain branch along National Highway' },
        { id: 'uncle-johns', name: "Uncle John's", category: 'eateries', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/uncle-johns/uncle-johns-1.jpg', description: '24/7 convenience store with hot fried chicken and meals' },
        { id: 'ding-hao', name: 'Ding Hao', category: 'eateries', barangay: 'Halang', municipality: 'Calamba', image_path: '../assets/places/ding-hao/ding-hao-1.jpg', description: 'Chinese restaurant along National Highway' },
        { id: 'teng-tengs', name: "Teng-Teng's", category: 'eateries', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/teng-tengs/teng-tengs-1.jpg', description: 'Popular local dining eatery in Real' },
        { id: 'mariz-food-town', name: 'Mariz Food Town', category: 'eateries', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/mariz-food-town/mariz-food-town-1.jpg', description: 'Casual food court and carinderia' },
        { id: 'ton-tons-sisig', name: "Ton-Ton's Sisig", category: 'eateries', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/ton-tons-sisig/ton-tons-sisig-1.jpg', description: 'Specialty sizzling sisig dining spot' },
        { id: 'mang-inasal-halang', name: 'Mang Inasal – Halang, Calamba', category: 'eateries', barangay: 'Halang', municipality: 'Calamba', image_path: '../assets/places/mang-inasal-halang-calamba/mang-inasal-halang-calamba-1.jpg', description: 'Famous Filipino grilled chicken restaurant' },
        { id: 'creekside-halang', name: 'Creekside Halang', category: 'eateries', barangay: 'Halang', municipality: 'Calamba', image_path: '../assets/places/creekside-halang/creekside-halang-1.jpg', description: 'Local grill and dining spot along the creek' },
        { id: 'dear-hotpot', name: 'Dear Hotpot – Unlimited Japanese Hotpot', category: 'eateries', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/dear-hotpot-unlimited-japanese-hotpot/dear-hotpot-unlimited-japanese-hotpot-1.jpg', description: 'Unlimited Japanese hotpot and shabu-shabu' },
        { id: 'd-fresco', name: "D' Fresco", category: 'eateries', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/d-fresco/d-fresco-1.jpg', description: 'Refreshing beverages and casual food' },
        { id: 'rsm-lutong-bahay', name: 'RSM Lutong Bahay – Real, Calamba', category: 'eateries', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/rsm-lutong-bahay-real-calamba/rsm-lutong-bahay-real-calamba-1.jpg', description: 'Traditional Filipino home-cooked dishes' },
        { id: 'krav-cafe', name: 'Krav Cafe', category: 'coffee', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/krav-cafe/krav-cafe-1.jpg', description: 'Artisanal coffee and specialty cafe drinks' },
        { id: 'card-sme-bank', name: 'CARD SME Bank – Calamba Branch', category: 'establishments', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/card-sme-bank/card-sme-bank-1.jpg', description: 'Thrift bank and financial service institution' },
        { id: 'wilcon-depot', name: 'Wilcon Depot Calamba', category: 'establishments', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/wilcon-depot-calamba/wilcon-depot-calamba-1.jpg', description: 'Home improvement and construction supplies depot' },
        { id: 'barangay-uno-hall', name: 'Barangay Uno Hall, Calamba City', category: 'establishments', barangay: 'Uno', municipality: 'Calamba', image_path: '../assets/places/barangay-uno-hall/barangay-uno-hall-1.jpg', description: 'Local government barangay hall for Barangay 1' },
        { id: 'laguna-logistics', name: 'Laguna Logistics', category: 'establishments', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/laguna-logistics/laguna-logistics-1.jpg', description: 'Logistics and freight handling services' },
        { id: 'rj-auto-shop', name: 'RJ Auto Shop', category: 'establishments', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/rj-auto-shop/rj-auto-shop-1.jpg', description: 'Automotive repair and maintenance service' },
        { id: 'news-star', name: 'News Star', category: 'establishments', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/news-star/news-star-1.jpg', description: 'Local commercial publication and printing office' },
        { id: 'd-and-q', name: 'D & Q', category: 'establishments', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/d-and-q/d-and-q-1.jpg', description: 'Commercial establishment in Real' },
        { id: 'morales-bercasio', name: 'Morales Bercasio', category: 'establishments', barangay: 'Real', municipality: 'Calamba', image_path: '../assets/places/morales-bercasio/morales-bercasio-1.jpg', description: 'Professional services and business office' }
    ];

    // Export to global scope
    root.escapeHtml = escapeHtml;
    root.resolvePlaceImageUrl = resolvePlaceImageUrl;
    root.formatPlaceCategory = formatPlaceCategory;
    root.FALLBACK_PLACES = FALLBACK_PLACES;
})(typeof window !== 'undefined' ? window : globalThis);
