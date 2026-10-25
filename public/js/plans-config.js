/**
 * Calzada Business Plans & Payment Configuration
 * All prices, plan limits, and payment details live here so they can be changed in one place.
 * Keep prices in sync with planPrice(p) in firestore.rules
 */

window.CALZADA_PLANS = {
  listed:   { id: 'listed',   name: 'Listed',       price: 59,  postsPerMonth: 4,    has360: false, featuredDays: 0,  pinnedPosts: 0, priorityReview: false },
  plus360:  { id: 'plus360',  name: 'Listed + 360', price: 199, postsPerMonth: 8,    has360: true,  featuredDays: 0,  pinnedPosts: 0, priorityReview: false, recommended: true },
  featured: { id: 'featured', name: 'Featured',     price: 299, postsPerMonth: null, has360: true,  featuredDays: 14, pinnedPosts: 1, priorityReview: true }
};

window.CALZADA_ADDONS = {
  extra360: { name: 'Extra 360 shoot', price: 99 },
  pinPost:  { name: 'Pin a post', price: 29, days: 7 }
};

window.CALZADA_PAYMENT = {
  method: 'gcash',
  qrImage: '/assets/payments/gcash-qr.png',
  reviewTimeText: { en: 'within 1–2 days', tl: 'sa loob ng 1–2 araw' }
};
