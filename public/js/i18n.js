/**
 * Calzada Language Toggle (i18n)
 * - Stores preference in localStorage
 * - Updates all [data-i18n] elements on the page
 * - Navbar links are never translated (by design)
 */

window.translations = {
    en: {
        // === index.html ===
        'hero.title':           'Find places you can explore in <span class="title-accent">Calamba.</span>',
        'hero.subtitle':        'Your local guide to spots worth the trip.',
        'hero.search.placeholder': 'Where do you want to go?',
        'about.heading':        'More than just directions.',
        'about.body':           'Calzada helps you discover places worth visiting around Calamba, then gets you there. Search a spot, see how to reach it, and pick a jeepney or tricycle, with fare estimates and directions in one place.',
        'about.learn_more':     'Learn more about Calzada',
        'about.card1.title':    'Find places',
        'about.card1.desc':     'Browse spots by category.',
        'about.card2.title':    'Jeepney or tricycle',
        'about.card2.desc':     'Pick the ride that fits your trip.',
        'about.card3.title':    'Fare estimates',
        'about.card3.desc':     'Know the cost before you leave.',
        'about.card4.title':    'Nearest stop',
        'about.card4.desc':     'Find the closest terminal or pickup point.',
        'about.card5.title':    'Travel',
        'about.card5.desc':     'Ride to your destination.',
        'news.heading':         'Latest News & Traffic',
        'news1.tag':            'Road Closure',
        'news1.title':          'Parian Flyover Maintenance',
        'news1.body':           'Repair work is scheduled on the Parian flyover this weekend. Motorists are advised to take alternate routes to avoid inconvenience.',
        'news1.date':           'Updated: 1 hour ago',
        'news2.tag':            'Heavy Traffic',
        'news2.title':          'Real Crossing Gridlock',
        'news2.body':           'Traffic flow is slow at the Real Crossing area due to high vehicle volume. Expect a 15–20 minute delay.',
        'news2.date':           'Updated: 34 mins ago',
        'fare.heading':         'Fare & LTFRB Updates',
        'fare1.tag':            'Fare Update',
        'fare1.title':          '₱13.00 Standard Fare Confirmed',
        'fare1.body':           'The minimum fare remains at ₱13 for traditional jeepneys and ₱15 for modern jeepneys throughout Region IV-A.',
        'fare1.date':           'Source: LTFRB Official',
        'fare2.tag':            'Rollout',
        'fare2.title':          'New Modern Jeeps in Canlubang',
        'fare2.body':           'Additional modern jeepney units have been deployed for the Canlubang – Calamba Crossing route for faster trips.',
        'fare2.date':           'Source: DOTr Laguna',
        'features.routes':      'Routes Covered',
        'features.modes':       'Transit Modes',
        'features.barangays':   'Barangays',
        'features.fare':        'Fare Info',
        'features.realtime':    'Real-time',
        'footer.tagline':       'Your reliable commuter guide platform in Calamba.',
        'footer.nav.heading':   'Navigation',
        'footer.nav.home':      'Home',
        'footer.nav.explore':   'Explore',
        'footer.nav.trips':     'My Trips',
        'footer.nav.maps':      'Maps',
        'footer.nav.planner':   'Planner',
        'footer.nav.feedback':  'Feedback',
        'footer.nav.submit':    'Submit a Route',
        'footer.nav.routie':    'Ask Routie',
        'footer.nav.about':     'About Us',
        'footer.nav.places':    'Explore',
        'footer.nav.faq':       'FAQs',
        'footer.nav.privacy':   'Privacy Policy',
        'footer.nav.terms':     'Terms of Service',
        'footer.contact.heading': 'Contact Us',
        'footer.copyright':     '© 2026 Calzada. All rights reserved.',
        // === chat ===
        'chat.label':           'Ask Routie',
        'chat.greeting':        "Hello! I'm Routie. Where do you want to go today?",
        'chat.placeholder':     'Type a message...',
        'chat.send':            'Send message',
        'chat.voice_input':     'Voice input',
        'chat.voice_stop':      'Stop listening',
        'chat.voice_err_unsupported': "Voice input isn't available in this browser. Try Chrome or Edge.",
        'chat.voice_err_permission':  "Microphone access was denied. Please allow microphone access in your browser settings.",
        'chat.voice_err_no_speech':   "No speech was detected. Please try speaking again.",
        'chat.voice_err_network':     "Network error during speech recognition. Please check your connection.",
        'chat.voice_err_generic':     "Voice input error occurred. Please try again.",
        'chip.route':           'How to use route search?',
        'chip.free':            'Is Calzada free?',
        'chip.modes':           'What transport modes are included?',
        'chip.p2p':             'P2P bus location?',
        'chip.platform':        'What is this platform for?',
        // === about.html ===
        'about_page.title':              'About',
        'about_page.lead':               "Calzada is the word for road or pathway. It's also a commuter guide for getting around Calamba, built around direction, clarity, and movement.",
        'about_page.p1':                 'Calzada helps you discover places worth visiting around Calamba, then shows you how to get there. Compare travel options based on estimated duration, fare cost, and walking distance — using a jeepney or tricycle — to find the most convenient way to reach your destination.',
        'about_page.p2':                 'Need to transfer between a jeepney and tricycle to reach your destination? Calzada supports that too. The platform is fully responsive on desktop and mobile, with a simple interface that makes route planning easy even for first-time users.',
        'about_page.goal.heading':       'Goal',
        'about_page.goal.body':          'The primary goal of Calzada is to help commuters discover great places around Calamba and reach them with confidence. By centralizing data on places, routes, and fares, the platform aims to reduce commuting stress, promote informed decisions, and make getting around the city simpler. Calzada aims to be a trusted companion for everyday exploring and commuting — helping you save time, manage expenses, and travel with confidence.',
        'about_page.covers.heading':     'What Calzada covers',
        'about_page.covers.note':        'Currently focused on selected barangays in Calamba.',
        'about_page.covers.ways':        'Ways to get around',
        'about_page.covers.places':      'Places you can find',
        'about_page.mode.jeepney':       'Jeepney',
        'about_page.mode.tricycle':      'Tricycle',
        'about_page.mode.walk':          'Walk',
        'about_page.cat.malls':          'Malls',
        'about_page.cat.eateries':       'Eateries',
        'about_page.cat.schools':        'Schools',
        'about_page.cat.terminals':      'Terminals',
        'about_page.cat.coffee':         'Coffee Shops',
        'about_page.cat.establishments': 'Establishments',
        'about_page.routie.title':       'Meet Routie',
        'about_page.routie.desc':        'Your chat assistant for finding places and getting around Calamba. Just tap “Ask Routie” anytime.',
        'about_page.routie.btn':         'Ask Routie',
        'about_page.business.heading':   'For local businesses',
        'about_page.business.note':      'For shops, eateries and services in Calamba.',
        'about_page.business.link':      'List your business',
        'about_page.business.step1_title': 'Register',
        'about_page.business.step1_desc': 'Name, category, address and a map pin.',
        'about_page.business.step2_title': 'Review',
        'about_page.business.step2_desc': 'The Calzada team checks every registration.',
        'about_page.business.step3_title': 'Profile',
        'about_page.business.step3_desc': 'Add a photo, description and social links.',
        'about_page.business.step4_title': 'Posts',
        'about_page.business.step4_desc': 'Share photos. They appear on Discover, newest first.',
        'about_page.business.feed_link': 'How does Discover decide what to show?',
        'about_page.business.example_caption': 'Example',
        'about_page.business.field_name': 'Business or place name',
        'about_page.business.field_category': 'Category',
        'about_page.business.field_address': 'Address',
        'about_page.business.pin_set':   'Pin set on the map',
        'about_page.business.sample_name': 'Kusina ni Aling Nena',
        'about_page.business.sample_category': 'Eateries & Dining',
        'about_page.business.sample_address': 'Brgy. Real, Calamba City',
        'about_page.business.status_pending': 'Pending review',
        'about_page.business.review_notice': "We're checking your details. You can see this status any time on My Business.",
        'about_page.business.status_approved': 'Approved · Live',
        'about_page.business.sample_desc': 'Authentic Lutong Bahay and fresh local specialties in Calamba.',
        'about_page.business.post_time': 'Just now',
        'about_page.business.post_caption': 'Serving hot Bulalo and Crispy Pata today! Visit us in Brgy. Real.',
        'about_page.business.step1_aria': 'Register step preview: business registration fields with name, category, address, and map pin',
        'about_page.business.step2_aria': 'Review step preview: registration pending verification with status notice and details',
        'about_page.business.step3_aria': 'Profile step preview: live approved business profile with photo, description, and social links',
        'about_page.business.step4_aria': 'Posts step preview: miniature Discover post with photo placeholder, business info, and like counter',
        'about_page.why.heading':        'Why Calzada?',
        'about_page.why.dir.title':      'Direction',
        'about_page.why.dir.desc':       'Clear, step-by-step routes so you always know where to go.',
        'about_page.why.trans.title':    'Transparency',
        'about_page.why.trans.desc':     'No hidden charges. Fare estimates are shown before you ride.',
        'about_page.why.trans.link':     'How fares are computed',
        'about_page.why.comm.title':     'Community',
        'about_page.why.comm.desc':      'Made for commuters, by commuters. Free and accessible to all.',
        'about_page.team.heading':       'Made by',
        'about_page.team.capstone':      'A capstone project by BSIT students of STI College Calamba.',
        'about_page.team.role':          'BSIT Student',
        'about_page.cta.heading':        'Ready to plan your journey?',
        'about_page.cta.sub':            'Find a place worth visiting, then get there by jeepney or tricycle — all in one app.',
        'about_page.cta.btn':            'Plan Your Route Now',

        // === fares.html ===
        'fares_page.title':              'Fares',
        'fares_page.lead':               'What a traditional jeepney ride should cost, based on the LTFRB fare guide.',
        'fares_page.effective_note':     'Effective {effectiveDate}. Fares shown are estimates.',
        'fares_page.estimate_title':     'Estimate a fare',
        'fares_page.calc_label':         'Distance (km)',
        'fares_page.calc_hint':          'Whole kilometers, 1 to {maxKm}',
        'fares_page.calc_hint_error':    'Enter a distance from 1 to {maxKm} km',
        'fares_page.calc_regular':       'Regular',
        'fares_page.calc_discounted':    'Student, senior citizen, or PWD',
        'fares_page.computed_title':     'How fares are computed',
        'fares_page.computed_regular':    '₱{baseFare} for the first {baseKm} km, plus ₱{perKm} for each additional km.',
        'fares_page.computed_discounted': '₱{discBaseFare} for the first {baseKm} km, plus ₱{discPerKm} for each additional km. That is a {discountPercent}% discount.',
        'fares_page.computed_note':      'Fares are rounded to the nearest {roundCentavos} centavos, which is why the discounted fare for the first {baseKm} km shows as ₱{discFirstFare} in the table. Students get the discount every day, including weekends and holidays.',
        'fares_page.table_title':        'Fare table',
        'fares_page.table_note':         'Discounted fares apply to students, senior citizens, and PWDs. Amounts are in pesos.',
        'fares_page.table_note_mobile':  'Disc. means the fare for students, senior citizens, and PWDs. Amounts are in pesos.',
        'fares_page.table_col_km':       'Km',
        'fares_page.table_col_regular':  'Regular',
        'fares_page.table_col_discounted': 'Discounted',
        'fares_page.table_col_disc':     'Disc.',
        'fares_page.table_caption':      'Official Traditional Jeepney Fare Matrix',
        'fares_page.source_title':       'Source',
        'fares_page.source_statement':   '{source} for {vehicle}s in {region}, effective {effectiveDate}. {sourceNote}',
        'fares_page.source_clarification': 'For clarification, visit www.ltfrb.gov.ph or call the LTFRB hotline at 1342.',
        'fares_page.source_btn':         'Download the official guide (PDF)',
        'fares_page.error_loading':      "We couldn't load the fares right now.",
        'fares_page.cta_title':          'Ready to plan your journey?',
        'fares_page.cta_subtitle':       'Find a place worth visiting, then get there by jeepney or tricycle — all in one app.',
        'fares_page.cta_btn':            'Plan Your Route Now',

        // === faq.html additions ===
        'faq_jeepney_fares.q':          'How are jeepney fares computed?',
        'faq_jeepney_fares.a':          'Jeepney fares follow the LTFRB fare guide: ₱{baseFare} for the first {baseKm} km, plus ₱{perKm} for each additional km, rounded to the nearest {roundCentavos} centavos. Students, senior citizens, and PWDs get {discountPercent}% off. Fares shown are estimates.',
        'faq_jeepney_fares.a_fallback': 'Jeepney fares follow the LTFRB fare guide. Fares shown are estimates.',
        'faq_jeepney_fares.link':       'See the full fare table',
        // === faq.html ===
        'faq.heading':          'Frequently Asked Questions',
        'faq.search_placeholder': 'Search questions...',
        'faq.pill_all':         'All',
        'faq.pill_general':     'General',
        'faq.pill_getting_around': 'Getting Around',
        'faq.pill_routie':      'Routie',
        'faq.pill_business':    'For Businesses',
        'faq1.q':               'What is Calzada?',
        'faq1.a':               'It helps you discover places worth visiting around Calamba and shows you how to get there by jeepney or tricycle, with fares and directions in one place.',
        'faq2.q':               'How do I use the route search feature?',
        'faq2.a':               'Simply enter your starting point and destination in the search bar, then click the button to begin. The system generates several route options showing travel time, fare cost, and walking distance.',
        'faq_fares.q':          'Does the website show exact fares?',
        'faq_fares.a':          'The platform provides estimated fares based on available data. Actual fares may vary slightly depending on operator policies, but the goal is to give commuters a clear idea of expected costs before traveling.',
        'faq_mobile.q':         'Can I access Calzada on mobile devices?',
        'faq_mobile.a':         'Yes. The website is built with a responsive design that adjusts to different screen sizes — desktop, laptop, or smartphone.',
        'faq_modes.q':          'What transport options does Calzada support?',
        'faq_modes.a':          'Jeepney and tricycle.',
        'faq_routie.q':         'What is Routie?',
        'faq_routie.a':         'Routie is your chat assistant — ask it to help you find places or figure out how to get there by jeepney or tricycle.',
        'faq3.q':               'Is Calzada free to use?',
        'faq3.a':               'Yes. Finding places, checking fares and planning routes on Calzada is free.',
        'faq4.q':               'What is the main goal of Calzada?',
        'faq4.a':               'The primary goal is to empower commuters with accurate, transparent, and easy-to-use transit information — reducing commuting stress and improving mobility in the city.',
        'faq5.q':               'How do I list my business on Calzada?',
        'faq5.a':               'Sign in, open "Register your business" from your profile menu, and fill in your business name, category, address and map pin. Each account can register one business.',
        'faq7.q':               'How long does approval take?',
        'faq7.a':               'Every registration is reviewed by the Calzada team before it appears publicly. You can check its status any time on your My Business page.',
        'faq8.q':               'Why was my registration rejected, and can I try again?',
        'faq8.a':               "If the details couldn't be verified, your My Business page shows the reason. You can correct them and register again.",
        'faq9.q':               'What can I change after my business is approved?',
        'faq9.a':               "Your profile photo, description and social links, any time. Your name, category, address and map pin are verified and can't be edited from your account.",
        'faq10.q':              'How does the Discover feed decide what to show?',
        'faq10.a':              'Posts from approved businesses appear newest first. Likes don\'t change the order.',
        'faq11.q':              'What can I post?',
        'faq11.a':              'Up to five photos per post with a caption of up to 500 characters. You can edit the caption or delete the post later.',
        // === feedback.html ===
        'feedback.routie.prompt1': 'Spotted a bug? Tell me!',
        'feedback.routie.prompt2': 'Got an idea to make Calzada better?',
        'feedback.routie.prompt3': 'Was a fare or a route wrong?',
        'feedback.routie.prompt4': 'Is a place missing from the map?',
        'feedback.routie.prompt5': 'Something confusing or hard to use?',
        'feedback.routie.prompt6': 'Just want to say hi? That works too.',
        'feedback.routie.sr':      'Routie says: tell us about bugs, ideas, wrong fares or routes, missing places, or anything else.',
        // === places.html ===
        'places.hero_title':    'Where will you ride, where will you get off?',
        'places.hero_subtitle': 'From sakayan to galaan — your smart guide to Calamba\'s must-visit places',
        'places.search_placeholder': 'Search for a place...',
        'places.cat_all':       'All Places',
        'places.cat_est':       'Establishments',
        'places.cat_malls':     'Malls',
        'places.cat_coffee':    'Coffee Shops',
        'places.cat_hangout':   'Hangout Place',
        'places.cat_terminals': 'Terminals',
        'places.cat_schools':   'Schools',
        'places.calamba_label': 'CALAMBA',
        'places.outside_label': 'OUTSIDE CALAMBA / FAMOUS PLACES',
        'places.no_results':    'No places found in this category.',
        'places.tag_est':       'Establishment',
        'places.tag_historic':  'Historic',
        'places.tag_mall':      'Mall',
        'places.tag_terminal':  'Terminal',
        'places.tag_school':    'School',
        'places.tag_culture':   'Culture',
        'places.tag_hub':       'Hub',
        'places.tag_leisure':   'Leisure',
        'places.tag_nature':    'Nature',
        'places.tag_hangout':   'Hangout',
        // === planner.html ===
        'planner.search_origin_placeholder': 'Where are you coming from?',
        'planner.search_dest_placeholder':   'Where are you going?',
        'planner.use_location': 'Use my Current Location',
        'planner.leave_now':    'Leave now',
        'planner.depart_at':    'Depart at...',
        'planner.arrive_by':    'Arrive by...',
        'planner.suggested_terminals': 'Suggested Terminals',
        'planner.transit_modes': 'Transit modes',
        'planner.simulan':       'Start Journey',
        'planner.lakbay_guide':  'Lakbay Guide',
        'planner.journey_started': 'Journey Started',
        'planner.trip_active':   'Trip Active',
        'planner.cancel':        'Cancel',
        'planner.reminders_title': 'Reminders',
        'planner.reset_north':   'Reset map to north',
        'planner.show_my_location': 'Show my location',
        'planner.geo_hint':      'Allow location to see where you are on the map',
        'planner.toast_dismiss': 'Dismiss',
        'planner.toast_locate_failed': "Couldn't detect your location. Check your location permission.",
        'planner.toast_gps_retry': 'GPS error. Retrying…',
        'planner.toast_route_updated': 'Route updated',
        'planner.toast_sched_soon': 'Scheduled routing is coming soon. Using the current time for now.',
        'planner.toast_resuming': 'Resuming journey to {dest}…',
        'planner.toast_destination': 'your destination',
        'planner.toast_resume_failed': "Couldn't get your current position. Tap Start Journey to resume.",
        'planner.toast_route_restored': 'Your last route was restored.',
        'planner.geo_denied':    'Location access is off. You can enable it in your browser settings.',
        'planner.geo_unavailable': "Couldn't get your location right now. The map still works.",
        'planner.account_menu':  'Account menu, {name}',
        'planner.reminders_subtitle': 'A few things to keep in mind before and during your ride.',
        'planner.reminders_group_before': 'Before you board',
        'planner.reminders_group_during': 'On the ride',
        'planner.reminders_close': 'Close reminders',
        'planner.reminders_got_it': 'Got It!',
        'planner.reminders_1':   'Ask the driver if they will pass by your destination.',
        'planner.reminders_2':   'Prepare exact fare to avoid change issues.',
        'planner.reminders_3':   'Take care of your belongings inside the vehicle.',
        'planner.reminders_5':   'Be alert while walking to the terminal.',
        'planner.login_title':   'Log in to Continue',
        'planner.login_desc':    'An account is needed to save your scheduled trips and receive departure reminders.',
        'planner.google_login':  'Continue with Google',
        'planner.mobile_login':  'Continue with Mobile',
        'planner.mobile_placeholder': 'Mobile Number (09XXXXXXXXX)',
        'planner.auth_disclaimer': 'By proceeding, you agree to our Terms & Privacy Policy.',
        'planner.picker_instruction': 'Move map to select location...',
        'planner.picker_confirm':   'Choose This Location',
        'planner.directions':       'Directions',
        'planner.guide':            'Guide',
        'planner.route_summary':    'Route Summary',
        'planner.cancel_route':     'Cancel Route',
        'planner.change_origin':    'Change Origin',
        'planner.my_location':      'My Location',
        'planner.pin_location':     'Pin Location',
        'planner.receipt_title':    'TRIP SUMMARY',
        'planner.rcpt_date':        'DATE',
        'planner.rcpt_departed':    'DEPARTED',
        'planner.rcpt_arrived':     'ARRIVED',
        'planner.rcpt_from':        'FROM',
        'planner.rcpt_total_fare':  'TOTAL FARE',
        'planner.rcpt_total_dist':  'TOTAL DIST',
        'planner.rcpt_travel_time': 'TRAVEL TIME',
        'planner.rcpt_thank_you':   'THANK YOU FOR RIDING WITH US!',
        'planner.success':          'Success!',
        // === login.html ===
        'login.title':          'Login',
        'login.register':       'Register',
        'login.welcome':        'Welcome Back!',
        'login.subtitle':       'Log in to continue navigating Calamba.',
        'login.email_placeholder': 'Email Address',
        'login.pass_placeholder': 'Password',
        'login.remember':       'Remember me',
        'login.forgot':         'Forgot Password?',
        'login.signin':         'Sign in',
        'login.or':             'Or continue with',
        'login.google':         'Sign in with Google',
        'login.create_title':   'Create an Account',
        'login.create_subtitle': 'Join us and streamline your daily commute.',
        'login.fullname_placeholder': 'Full Name',
        'login.create_pass_placeholder': 'Create Password',
        'login.confirm_pass_placeholder': 'Confirm Password',
        'login.req_8char':      'At least 8 characters',
        'login.req_number':     'Contains a number',
        'login.req_special':    'Contains a special character (!@#)',
        'login.agree_label':     'I agree to the <button type="button" class="auth-legal-link" data-open-legal="terms">Terms</button> &amp; <button type="button" class="auth-legal-link" data-open-legal="privacy">Privacy Policy</button>',
        'login.terms_notice':    'By continuing, you agree to our <button type="button" class="auth-legal-link" data-open-legal="terms">Terms of Service</button> and <button type="button" class="auth-legal-link" data-open-legal="privacy">Privacy Policy</button>.',
        'login.create_btn':     'Create Account',
        'login.secure_access':  '<strong>Secure Access:</strong> Your data is encrypted and securely stored.',
        'login.guest':          'Continue as Guest',
        // === dynamic/js ===
        'js.calculating':       'Calculating route...',
        'js.sumakay':           'Ride a',
        'js.maglakad':          'Walk',
        'js.nakarating':        'Arrived!',
        'js.mula':              'From',
        'js.iyong_lokasyon':     'Your Location',
        'js.sakay_ng':          'Take a',
        'js.papunta_sa':        'going to',
        'js.pumunta_sa':        'Go to',
        'js.direktang_byahe':   'Direct trip to',
        'js.umalis_ng':         'Leave at',
        'js.makakarating_ng':   'will arrive at about',
        'js.para_makarating':   'to arrive by',
        'js.departure_reminder': 'Departure reminder',
        'planner.plan_route':   'Plan Route',
        'js.session_ended':     'Session ended due to inactivity.',
        'js.error_system':      "I'm sorry, I'm having trouble right now. Please try again later.",
        'js.error_connection':  "Oops! I can't connect. Please check your internet.",
        'js.error_voice':       'Voice recognition error',
        'js.error_mic':         'Unable to access microphone. Please check permissions.',
        'planner.dt_hr':        'HR',
        'planner.dt_min':       'MIN',
        'planner.dt_am':        'AM',
        'planner.dt_pm':        'PM',
        'planner.dt_leave':     'Leave',
        'planner.dt_arrive':    'Arrive',
        'planner.dt_now':       'Now',
        'planner.dt_set':       'Set Schedule',
        'planner.schedule_journey': 'Schedule Journey',
        'planner.depart_at_pre': 'Depart at',
        'planner.arrive_by_pre': 'Arrive by',
        'planner.calculating_route': 'Calculating route...',
        'planner.badge_fastest': 'Fastest',
        'planner.badge_cheapest': 'Cheapest',
        'planner.badge_least_transfer': 'Least Transfers',
        'planner.fare_breakdown': 'Fare Breakdown',
        'planner.fare_disclaimer': 'Fares are estimated. Actual may vary.',
        'planner.mark_done': 'Mark as Done',
        'planner.leg_progress': 'Leg {current} of {total}',
        'planner.arrival_title': 'Arrived at Destination!',
        'planner.no_routes': 'No routes found. Please check your destination.',
        'planner.tracking_unavailable': 'GPS tracking unavailable. Using manual mode.',
        'planner.reached_landmark': "You've reached {name}. Moving to next step.",
        'planner.recenter': 'Re-center',

        'js.server_wakeup':     "I'm still waking up the server. Sorry for the delay! Please try sending your message again in 10-20 seconds. 😅",
        'js.osm_attribution':   "🗺️ Search results powered by <a href='https://www.openstreetmap.org' target='_blank'>OpenStreetMap</a> / Nominatim"
    },

    tl: {
        // === index.html ===
        'hero.title':           'Maghanap ng mga lugar na pwedeng puntahan sa <span class="title-accent">Calamba.</span>',
        'hero.subtitle':        'Ang iyong lokal na gabay sa mga lugar na sulit puntahan.',
        'hero.search.placeholder': 'Saan ka pupunta?',
        'about.heading':        'Higit pa sa simpleng direksyon.',
        'about.body':           'Tinutulungan ka ng Calzada na makahanap ng mga lugar na sulit bisitahin sa Calamba at makarating doon. Maghanap ng lugar, alamin kung paano pumunta, at pumili ng jeepney o tricycle, na may tantiya sa pamasahe at direksyon sa iisang lugar.',
        'about.learn_more':     'Alamin pa ang tungkol sa Calzada',
        'about.card1.title':    'Maghanap ng lugar',
        'about.card1.desc':     'Maghanap ng lugar ayon sa kategorya.',
        'about.card2.title':    'Jeepney o tricycle',
        'about.card2.desc':     'Pumili ng sasakyan na angkop sa biyahe.',
        'about.card3.title':    'Tantiya sa pamasahe',
        'about.card3.desc':     'Alamin ang pamasahe bago umalis.',
        'about.card4.title':    'Pinakamalapit na sakayan',
        'about.card4.desc':     'Hanapin ang pinakamalapit na terminal o sakayan.',
        'about.card5.title':    'Biyahe na',
        'about.card5.desc':     'Sumakay at makarating sa pupuntahan mo.',
        'news.heading':         'Pinakabagong Balita at Trapiko',
        'news1.tag':            'Saradong Daan',
        'news1.title':          'Pagkukumpuni ng Parian Flyover',
        'news1.body':           'May schedule na repair sa Parian flyover ngayong weekend. Pinapayuhan ang mga motorista na dumaan sa alternate routes para makaiwas sa abala.',
        'news1.date':           'Na-update: 1 oras na ang nakaraan',
        'news2.tag':            'Matinding Trapiko',
        'news2.title':          'Traffic sa Real Crossing',
        'news2.body':           'Mabagal ang daloy ng trapiko sa Real Crossing area dahil sa volume ng sasakyan. Asahan ang 15–20 mins na pagkaantala sa biyahe.',
        'news2.date':           'Na-update: 34 minuto na ang nakaraan',
        'fare.heading':         'Pamasahe at LTFRB Updates',
        'fare1.tag':            'Bagong Pamasahe',
        'fare1.title':          'Kinumpirmang ₱13.00 na Minimum Fare',
        'fare1.body':           'Nanatili ang minimum fare sa ₱13 para sa traditional jeepneys at ₱15 para sa modern jeepneys sa buong Region IV-A.',
        'fare1.date':           'Pinagmulan: LTFRB Official',
        'fare2.tag':            'Paglulunsad',
        'fare2.title':          'Bagong Modern Jeep sa Canlubang',
        'fare2.body':           'Nagdagdag pa ng bagong units ng modern jeepney para sa Canlubang – Calamba Crossing route para sa mas mabilis na biyahe.',
        'fare2.date':           'Pinagmulan: DOTr Laguna',
        'features.routes':      'Mga Rutang Sakop',
        'features.modes':       'Transit Modes',
        'features.barangays':   'Mga Barangay',
        'features.fare':        'Impormasyon sa Pamasahe',
        'features.realtime':    'Real-time',
        'footer.tagline':       'Ang iyong maaasahang gabay sa commute sa Calamba.',
        'footer.nav.heading':   'Navigation',
        'footer.nav.home':      'Home',
        'footer.nav.explore':   'Tuklasin',
        'footer.nav.trips':     'Aking Biyahe',
        'footer.nav.maps':      'Mga Mapa',
        'footer.nav.planner':   'Planner',
        'footer.nav.feedback':  'Feedback',
        'footer.nav.submit':    'Mag-submit ng Ruta',
        'footer.nav.routie':    'Magtanong sa Routie',
        'footer.nav.about':     'Tungkol sa Amin',
        'footer.nav.places':    'Tuklasin',
        'footer.nav.faq':       'FAQs',
        'footer.nav.privacy':   'Patakaran sa Privacy',
        'footer.nav.terms':     'Mga Tuntunin sa Paggamit',
        'footer.contact.heading': 'Makipag-ugnayan',
        'footer.copyright':     '© 2026 Calzada. Lahat ng karapatan ay nakalaan.',
        
        // === chat ===
        'chat.label':           'Magtanong kay Routie',
        'chat.greeting':        "Kamusta! Ako si Routie. Saan ka pupunta ngayon?",
        'chat.placeholder':     'Mag-type ng mensahe...',
        'chat.send':            'Ipadala ang mensahe',
        'chat.voice_input':     'Voice input',
        'chat.voice_stop':      'Ihinto ang pakikinig',
        'chat.voice_err_unsupported': 'Hindi available ang voice input sa browser na ito. Subukan ang Chrome o Edge.',
        'chat.voice_err_permission':  'Hindi pinayagan ang microphone access. Paki-enable ang microphone sa settings ng iyong browser.',
        'chat.voice_err_no_speech':   'Walang narinig na boses. Pakisubukan muling magsalita.',
        'chat.voice_err_network':     'Nagkaproblema sa network habang nagre-record. Paki-check ang iyong koneksyon.',
        'chat.voice_err_generic':     'Nagka-error sa voice input. Pakisubukan muli.',
        'chip.route':           'Paano gamitin ang route search?',
        'chip.free':            'Libre ba ang Calzada?',
        'chip.modes':           'Anong transport modes ang available?',
        'chip.p2p':             'Saan ang location ng P2P bus?',
        'chip.platform':        'Para saan itong platform?',
        
        // === about.html ===
        'about_page.title':              'About',
        'about_page.lead':               "Calzada ang salita para sa daan o landas. Isa rin itong gabay para sa pagbiyahe sa Calamba, na nakatuon sa direksyon, linaw, at tuloy-tuloy na biyahe.",
        'about_page.p1':                 'Tinutulungan ka ng Calzada na tumuklas ng mga lugar na sulit bisitahin sa Calamba, at ipinapakita kung paano makapunta roon. Ikumpara ang mga opsyon sa biyahe base sa tantiya ng oras, pamasahe, at lakad — gamit ang jeepney o tricycle — para mahanap ang pinakamadaling paraan para makarating sa iyong destinasyon.',
        'about_page.p2':                 'Kailangan mo bang lumipat mula sa jeepney papuntang tricycle para makarating sa iyong destinasyon? Sinusuportahan din \'yan ng Calzada. Ang platform ay fully responsive sa desktop at mobile, na may simpleng interface para madali ang pagplano ng biyahe kahit bago ka pa lang dito.',
        'about_page.goal.heading':       'Goal',
        'about_page.goal.body':          'Ang pangunahing layunin ng Calzada ay tulungan ang mga bumibyahe na tumuklas ng magagandang lugar sa Calamba at makarating nang panatag. Sa pagtipon ng impormasyon ukol sa mga lugar, ruta, at pamasahe, naglalayon ang platform na mabawasan ang stress sa pagbiyahe, magbigay ng tamang desisyon, at padaliin ang pag-ikot sa lungsod. Hangad ng Calzada na maging maaasahang kasama sa pang-araw-araw na paglalakbay — tumutulong na makatipid ng oras, magbadyet ng pamasahe, at bumiyahe nang may kumpiyansa.',
        'about_page.covers.heading':     'What Calzada covers',
        'about_page.covers.note':        'Kasalukuyang nakatutok sa mga piling barangay sa Calamba.',
        'about_page.covers.ways':        'Ways to get around',
        'about_page.covers.places':      'Places you can find',
        'about_page.mode.jeepney':       'Jeepney',
        'about_page.mode.tricycle':      'Tricycle',
        'about_page.mode.walk':          'Walk',
        'about_page.cat.malls':          'Malls',
        'about_page.cat.eateries':       'Eateries',
        'about_page.cat.schools':        'Schools',
        'about_page.cat.terminals':      'Terminals',
        'about_page.cat.coffee':         'Coffee Shops',
        'about_page.cat.establishments': 'Establishments',
        'about_page.routie.title':       'Meet Routie',
        'about_page.routie.desc':        'Ang iyong chat assistant para sa paghahanap ng lugar at pagbiyahe sa Calamba. I-tap lang ang “Ask Routie” anumang oras.',
        'about_page.routie.btn':         'Ask Routie',
        'about_page.business.heading':   'Para sa mga lokal na negosyo',
        'about_page.business.note':      'Para sa mga tindahan, kainan, at serbisyo sa Calamba.',
        'about_page.business.link':      'Ilista ang iyong negosyo',
        'about_page.business.step1_title': 'Magrehistro',
        'about_page.business.step1_desc': 'Pangalan, category, address, at map pin.',
        'about_page.business.step2_title': 'Pagsusuri',
        'about_page.business.step2_desc': 'Sinusuri ng Calzada team ang bawat rehistrasyon.',
        'about_page.business.step3_title': 'Profile',
        'about_page.business.step3_desc': 'Magdagdag ng litrato, paglalarawan, at social links.',
        'about_page.business.step4_title': 'Mga Post',
        'about_page.business.step4_desc': 'Magbahagi ng mga litrato. Lalabas ang mga ito sa Discover, pinakabago muna.',
        'about_page.business.feed_link': 'Paano nagpapasya ang Discover kung ano ang ipapakita?',
        'about_page.business.example_caption': 'Halimbawa',
        'about_page.business.field_name': 'Pangalan ng negosyo o lugar',
        'about_page.business.field_category': 'Category',
        'about_page.business.field_address': 'Address',
        'about_page.business.pin_set':   'Naitakda ang pin sa mapa',
        'about_page.business.sample_name': 'Kusina ni Aling Nena',
        'about_page.business.sample_category': 'Eateries & Dining',
        'about_page.business.sample_address': 'Brgy. Real, Calamba City',
        'about_page.business.status_pending': 'Kasalukuyang sinusuri',
        'about_page.business.review_notice': 'Sinusuri namin ang iyong mga detalye. Maaari mong makita ang status na ito anumang oras sa My Business.',
        'about_page.business.status_approved': 'Aprubado · Live',
        'about_page.business.sample_desc': 'Tunay na Lutong Bahay at sariwang lokal na putahe sa Calamba.',
        'about_page.business.post_time': 'Kani-kanina lang',
        'about_page.business.post_caption': 'Naghahain ng mainit na Bulalo at Crispy Pata ngayon! Bisitahin kami sa Brgy. Real.',
        'about_page.business.step1_aria': 'Preview ng pagpaparehistro: mga field para sa pangalan, category, address, at map pin',
        'about_page.business.step2_aria': 'Preview ng pagsusuri: nakabinbing rehistrasyon na may paalala at detalye',
        'about_page.business.step3_aria': 'Preview ng profile: live na aprubadong profile ng negosyo na may larawan at social links',
        'about_page.business.step4_aria': 'Preview ng mga post: miniature Discover post na may larawan, impormasyon, at likes',
        'about_page.why.heading':        'Why Calzada?',
        'about_page.why.dir.title':      'Direction',
        'about_page.why.dir.desc':       'Malinaw at bawat hakbang na ruta para laging alam kung saan pupunta.',
        'about_page.why.trans.title':    'Transparency',
        'about_page.why.trans.desc':     'Walang nakatagong singil. Ipinapakita ang tantiya sa pamasahe bago sumakay.',
        'about_page.why.trans.link':     'How fares are computed',
        'about_page.why.comm.title':     'Community',
        'about_page.why.comm.desc':      'Gawa para sa mga commuter, ng mga commuter. Libre at bukas para sa lahat.',
        'about_page.team.heading':       'Made by',
        'about_page.team.capstone':      'Isang capstone project ng mga mag-aaral ng BSIT sa STI College Calamba.',
        'about_page.team.role':          'BSIT Student',
        'about_page.cta.heading':        'Ready to plan your journey?',
        'about_page.cta.sub':            'Maghanap ng lugar na sulit puntahan, at bumiyahe sakay ng jeepney o tricycle — lahat sa iisang app.',
        'about_page.cta.btn':            'Plan Your Route Now',

        // === fares.html ===
        'fares_page.title':              'Fares',
        'fares_page.lead':               'Ang dapat na pamasahe sa traditional jeepney, batay sa LTFRB fare guide.',
        'fares_page.effective_note':     'Epektibo noong {effectiveDate}. Ang mga ipinakitang pamasahe ay mga tantiya lamang.',
        'fares_page.estimate_title':     'Estimate a fare',
        'fares_page.calc_label':         'Distansya (km)',
        'fares_page.calc_hint':          'Buong kilometro, 1 hanggang {maxKm}',
        'fares_page.calc_hint_error':    'Maglagay ng distansya mula 1 hanggang {maxKm} km',
        'fares_page.calc_regular':       'Regular',
        'fares_page.calc_discounted':    'Estudyante, senior citizen, o PWD',
        'fares_page.computed_title':     'How fares are computed',
        'fares_page.computed_regular':    '₱{baseFare} para sa unang {baseKm} km, dagdag na ₱{perKm} sa bawat karagdagang km.',
        'fares_page.computed_discounted': '₱{discBaseFare} para sa unang {baseKm} km, dagdag na ₱{discPerKm} sa bawat karagdagang km. Katumbas ito ng {discountPercent}% na diskwento.',
        'fares_page.computed_note':      'Ang pamasahe ay niroround sa pinakamalapit na {roundCentavos} sentimos, kaya ang discounted na pamasahe para sa unang {baseKm} km ay ₱{discFirstFare} sa talahanayan. May diskwento ang mga estudyante araw-araw, kabilang ang Sabado, Linggo, at pista opisyal.',
        'fares_page.table_title':        'Fare table',
        'fares_page.table_note':         'Nalalapat ang may diskwentong pamasahe sa mga estudyante, senior citizen, at PWD. Ang halaga ay nasa piso.',
        'fares_page.table_note_mobile':  'Ang Disc. ay pamasahe para sa estudyante, senior citizen, at PWD. Ang halaga ay nasa piso.',
        'fares_page.table_col_km':       'Km',
        'fares_page.table_col_regular':  'Regular',
        'fares_page.table_col_discounted': 'May Diskwento',
        'fares_page.table_col_disc':     'Disc.',
        'fares_page.table_caption':      'Opisyal na Talaan ng Pamasahe sa Traditional Jeepney',
        'fares_page.source_title':       'Source',
        'fares_page.source_statement':   '{source} para sa mga {vehicle} sa {region}, epektibo noong {effectiveDate}. {sourceNote}',
        'fares_page.source_clarification': 'Para sa paglilinaw, bisitahin ang www.ltfrb.gov.ph o tumawag sa LTFRB hotline sa 1342.',
        'fares_page.source_btn':         'I-download ang opisyal na gabay (PDF)',
        'fares_page.error_loading':      'Hindi namin mai-load ang pamasahe sa ngayon.',
        'fares_page.cta_title':          'Ready to plan your journey?',
        'fares_page.cta_subtitle':       'Maghanap ng lugar na sulit puntahan, at bumiyahe sakay ng jeepney o tricycle — lahat sa iisang app.',
        'fares_page.cta_btn':            'Plan Your Route Now',

        // === faq.html additions ===
        'faq_jeepney_fares.q':          'Paano kinukwenta ang pamasahe sa jeepney?',
        'faq_jeepney_fares.a':          'Sumusunod ang pamasahe sa jeepney sa LTFRB fare guide: ₱{baseFare} para sa unang {baseKm} km, dagdag na ₱{perKm} sa bawat karagdagang km, niroround sa pinakamalapit na {roundCentavos} sentimos. May {discountPercent}% na diskwento ang mga estudyante, senior citizen, at PWD. Ang mga ipinakitang pamasahe ay mga tantiya lamang.',
        'faq_jeepney_fares.a_fallback': 'Sumusunod ang pamasahe sa jeepney sa LTFRB fare guide. Ang mga ipinakitang pamasahe ay mga tantiya lamang.',
        'faq_jeepney_fares.link':       'Tingnan ang buong talahanayan ng pamasahe',
        
        // === faq.html ===
        'faq.heading':          'Mga Madalas na Katanungan (FAQs)',
        'faq.search_placeholder': 'Maghanap ng tanong...',
        'faq.pill_all':         'Lahat',
        'faq.pill_general':     'Pangkalahatan',
        'faq.pill_getting_around': 'Pagbibiyahe',
        'faq.pill_routie':      'Routie',
        'faq.pill_business':    'Para sa Negosyo',
        'faq1.q':               'Ano ang Calzada?',
        'faq1.a':               'Tinutulungan ka nitong tumuklas ng mga lugar na sulit bisitahin sa Calamba at ipinapakita kung paano makapunta roon gamit ang jeepney o tricycle, kasama ang pamasahe at direksyon sa iisang lugar.',
        'faq2.q':               'Paano gamitin ang route search?',
        'faq2.a':               'I-type lang kung saan ka manggagaling at kung saan ka pupunta sa search bar, tapos i-click ang button. Magpapakita ang system ng mga options na may estimated na oras, pamasahe, at lakad.',
        'faq_fares.q':          'Eksakto ba ang pamasahe na pinapakita ng website?',
        'faq_fares.a':          'Estimated fare lang ang ipinapakita base sa available data natin mula sa LTFRB. Pwedeng magbago nang konti depende sa mga operator, pero sapat na ito para may idea ka kung magkano aabutin.',
        'faq_mobile.q':         'Pwede ko bang gamitin ang Calzada sa phone?',
        'faq_mobile.a':         'Oo naman! Ginawa ang website natin na responsive kaya sakto ang itsura nito mapa-cellphone, tablet, o laptop man gamit mo.',
        'faq_modes.q':          'Anong transport options ang sinusuportahan ng Calzada?',
        'faq_modes.a':          'Jeepney at tricycle.',
        'faq_routie.q':         'Ano ang Routie?',
        'faq_routie.a':         'Ang Routie ay ang iyong chat assistant — magtanong lang sa kanya para tulungan kang maghanap ng lugar o alamin kung paano makapunta roon gamit ang jeepney o tricycle.',
        'faq3.q':               'Libre ba gamitin ang Calzada?',
        'faq3.a':               'Oo. Libre ang paghahanap ng mga lugar, pagtingin ng pamasahe, at pag-alam ng ruta sa Calzada.',
        'faq4.q':               'Ano ang main goal ng Calzada?',
        'faq4.a':               'Gusto lang namin padaliin ang buhay ng mga commuter by providing accurate and easy-to-use transit info, para less stress at mas mabilis ang byahe.',
        'faq5.q':               'Paano ko maililista ang aking negosyo sa Calzada?',
        'faq5.a':               'Mag-sign in, buksan ang "Register your business" mula sa profile menu, at ilagay ang pangalan ng iyong negosyo, category, address, at map pin. Bawat account ay maaaring magrehistro ng isang negosyo.',
        'faq7.q':               'Gaano katagal bago maaprubahan?',
        'faq7.a':               'Sinusuri ng Calzada team ang bawat rehistrasyon bago ito lumabas sa publiko. Maaari mong tingnan ang status nito anumang oras sa iyong My Business page.',
        'faq8.q':               'Bakit hindi naaprubahan ang aking rehistrasyon, at maaari ba akong sumubok muli?',
        'faq8.a':               'Kung hindi makumpirma ang mga detalye, ipapakita sa iyong My Business page ang dahilan. Maaari mo itong itama at magparehistro muli.',
        'faq9.q':               'Ano ang maaari kong baguhin kapag naaprubahan na ang aking negosyo?',
        'faq9.a':               'Ang iyong profile photo, description, at social links, anumang oras. Ang iyong pangalan, category, address, at map pin ay beripikado na at hindi na maaaring i-edit mula sa iyong account.',
        'faq10.q':              'Paano nagpapasya ang Discover feed kung ano ang ipapakita?',
        'faq10.a':              'Ang mga post mula sa mga aprubadong negosyo ay lumalabas nang pinakabago muna. Hindi binabago ng likes ang pagkakasunod-sunod.',
        'faq11.q':              'Ano ang maaari kong i-post?',
        'faq11.a':              'Hanggang limang litrato bawat post na may caption na hanggang 500 characters. Maaari mong i-edit ang caption o burahin ang post sa ibang pagkakataon.',
        // === feedback.html ===
        'feedback.routie.prompt1': 'May nakitang bug? Sabihin mo sa akin!',
        'feedback.routie.prompt2': 'May ideya para mas mapaganda ang Calzada?',
        'feedback.routie.prompt3': 'Mali ba ang pamasahe o ruta?',
        'feedback.routie.prompt4': 'May kulang bang lugar sa mapa?',
        'feedback.routie.prompt5': 'May nakakalito o mahirap gamitin?',
        'feedback.routie.prompt6': "Gusto mo lang bumati? Pwede rin 'yan.",
        'feedback.routie.sr':      'Sabi ni Routie: sabihin sa amin ang mga bug, ideya, maling pamasahe o ruta, nawawalang lugar, o anumang bagay.',
        
        // === places.html ===
        'places.hero_title':    'Saan ka sasakay, saan ka bababa?',
        'places.hero_subtitle': 'Mula sakayan hanggang galaan — ito ang smart guide mo para sa mga sikat na lugar sa Calamba.',
        'places.search_placeholder': 'Maghanap ng lugar...',
        'places.cat_all':       'Lahat',
        'places.cat_est':       'Mga Establishments',
        'places.cat_malls':     'Mga Mall',
        'places.cat_coffee':    'Mga Coffee Shop',
        'places.cat_hangout':   'Mga Tambayan',
        'places.cat_terminals': 'Mga Terminal',
        'places.cat_schools':   'Mga Paaralan',
        'places.calamba_label': 'CALAMBA',
        'places.outside_label': 'LABAS NG CALAMBA / SIKAT NA LUGAR',
        
        // === planner.html ===
        'planner.search_origin_placeholder': 'Saan ka manggagaling?',
        'planner.search_dest_placeholder':   'Saan ka pupunta?',
        'planner.use_location': 'Gamitin ang aking Location',
        'planner.leave_now':    'Umalis na ngayon',
        'planner.depart_at':    'Umalis nang...',
        'planner.arrive_by':    'Dumating bago mag...',
        'planner.suggested_terminals': 'Suggested na mga Terminal',
        'planner.transit_modes': 'Mga Pwedeng Sakyan',
        'planner.simulan':       'Simulan ang Byahe',
        'planner.lakbay_guide':  'Lakbay Guide',
        'planner.journey_started': 'Nagsimula na ang Byahe',
        'planner.trip_active':   'Aktibo ang Byahe',
        'planner.cancel':        'I-cancel',
        'planner.reminders_title': 'Mga Paalala',
        'planner.reset_north':   'I-reset ang mapa sa hilaga',
        'planner.show_my_location': 'Ipakita ang lokasyon ko',
        'planner.geo_hint':      'Payagan ang lokasyon para makita kung nasaan ka sa mapa',
        'planner.toast_dismiss': 'Isara',
        'planner.toast_locate_failed': 'Hindi ma-detect ang iyong lokasyon. I-check ang location permission.',
        'planner.toast_gps_retry': 'May problema sa GPS. Sinusubukang muli…',
        'planner.toast_route_updated': 'Na-update ang ruta',
        'planner.toast_sched_soon': 'Malapit na ang naka-iskedyul na ruta. Kasalukuyang oras muna ang gagamitin.',
        'planner.toast_resuming': 'Itinutuloy ang byahe papuntang {dest}…',
        'planner.toast_destination': 'iyong destinasyon',
        'planner.toast_resume_failed': 'Hindi makuha ang kasalukuyang posisyon mo. I-tap ang Simulan ang Byahe para ituloy.',
        'planner.toast_route_restored': 'Naibalik ang huli mong ruta.',
        'planner.geo_denied':    'Naka-off ang access sa lokasyon. Puwede mo itong i-on sa settings ng browser mo.',
        'planner.geo_unavailable': 'Hindi makuha ang lokasyon mo ngayon. Gumagana pa rin ang mapa.',
        'planner.account_menu':  'Menu ng account, {name}',
        'planner.reminders_subtitle': 'Ilang paalala bago at habang nasa biyahe.',
        'planner.reminders_group_before': 'Bago sumakay',
        'planner.reminders_group_during': 'Habang nasa biyahe',
        'planner.reminders_close': 'Isara ang mga paalala',
        'planner.reminders_got_it': 'Naintindihan ko!',
        'planner.reminders_1':   'Tanungin ang driver kung dadaan sila sa bababaan mo bago sumakay.',
        'planner.reminders_2':   'Maghanda ng barya para iwas-abala sa sukli.',
        'planner.reminders_3':   'Laging ingatan ang iyong mga gamit sa loob ng byahe.',
        'planner.reminders_5':   'Maging alerto kapag naglalakad papuntang terminal.',
        'planner.login_title':   'Mag-Login para Magpatuloy',
        'planner.login_desc':    'Kailangan mo ng account para ma-save ang scheduled trips mo at makatanggap ng departure reminders.',
        'planner.google_login':  'Mag-login gamit ang Google',
        'planner.mobile_login':  'Mag-login gamit ang Mobile',
        'planner.mobile_placeholder': 'Mobile Number (09XXXXXXXXX)',
        'planner.auth_disclaimer': 'Sa pagpapatuloy, pumapayag ka sa aming Terms & Privacy Policy.',
        'planner.picker_instruction': 'Igalaw ang map para pumili ng location...',
        'planner.picker_confirm':   'Piliin ang Location na Ito',
        'planner.directions':       'Mga Direksyon',
        'planner.guide':            'Gabay',
        'planner.route_summary':    'Buod ng Ruta',
        'planner.cancel_route':     'I-cancel ang Ruta',
        'planner.change_origin':    'Palitan ang Pinanggalingan',
        'planner.my_location':      'Aking Lokasyon',
        'planner.pin_location':     'I-pin ang Lokasyon',
        'planner.receipt_title':    'BUOD NG BYAHE',
        'planner.rcpt_date':        'PETSA',
        'planner.rcpt_departed':    'UMALIS',
        'planner.rcpt_arrived':     'DUMATING',
        'planner.rcpt_from':        'MULA',
        'planner.rcpt_total_fare':  'KABUUANG PAMASAHE',
        'planner.rcpt_total_dist':  'KABUUANG DISTANSYA',
        'planner.rcpt_travel_time': 'ORAS NG BYAHE',
        'planner.rcpt_thank_you':   'SALAMAT SA PAGSAKAY!',
        'planner.success':          'Success!',
        
        // === login.html ===
        'login.title':          'Login',
        'login.register':       'Mag-Register',
        'login.welcome':        'Welcome Back!',
        'login.subtitle':       'Mag-login para magpatuloy sa pag-navigate sa Calamba.',
        'login.email_placeholder': 'Email Address',
        'login.pass_placeholder': 'Password',
        'login.remember':       'I-save ang login',
        'login.forgot':         'Nakalimutan ang Password?',
        'login.signin':         'Mag-Sign in',
        'login.or':             'O mag-login gamit ang',
        'login.google':         'Mag-Sign in gamit ang Google',
        'login.create_title':   'Gumawa ng Account',
        'login.create_subtitle': 'Sumali na para mapadali ang araw-araw na byahe mo.',
        'login.fullname_placeholder': 'Buong Pangalan',
        'login.create_pass_placeholder': 'Gumawa ng Password',
        'login.confirm_pass_placeholder': 'I-confirm ang Password',
        'login.req_8char':      'Kahit 8 characters man lang',
        'login.req_number':     'May kasamang numero',
        'login.req_special':    'May special character (!@#)',
        'login.agree_label':     'Pumapayag ako sa <button type="button" class="auth-legal-link" data-open-legal="terms">Terms</button> at <button type="button" class="auth-legal-link" data-open-legal="privacy">Privacy Policy</button>',
        'login.terms_notice':    'Sa pagpapatuloy, sumasang-ayon ka sa aming <button type="button" class="auth-legal-link" data-open-legal="terms">Terms of Service</button> at <button type="button" class="auth-legal-link" data-open-legal="privacy">Privacy Policy</button>.',
        'login.create_btn':     'Gumawa ng Account',
        'login.secure_access':  '<strong>Secured Access:</strong> Naka-encrypt at ligtas ang iyong data.',
        'login.guest':          'Magpatuloy bilang Guest',
        
        // === dynamic/js ===
        'js.calculating':       'Kinakalkula ang ruta...',
        'js.sumakay':           'Sumakay ng',
        'js.maglakad':          'Maglakad',
        'js.nakarating':        'Nakarating na!',
        'js.mula':              'Mula',
        'js.iyong_lokasyon':     'Iyong Location',
        'js.sakay_ng':          'Sakay ng',
        'js.papunta_sa':        'papunta sa',
        'js.pumunta_sa':        'Pumunta sa',
        'js.direktang_byahe':   'Diretsong byahe papuntang',
        'js.umalis_ng':         'Umalis ng',
        'js.makakarating_ng':   'makakarating nang bandang',
        'js.para_makarating':   'para makarating ng',
        'js.departure_reminder': 'Paalala sa pag-alis',
        'planner.plan_route':   'Mag-plano ng Ruta',
        'js.session_ended':     'Nag-end na ang session dahil walang activity.',
        'js.error_system':      "Pasensya na, may problema ang system ko ngayon. Try ulit mamaya.",
        'js.error_connection':  "Naku! Hindi ako maka-connect. Paki-check ang internet mo.",
        'js.error_voice':       'Voice recognition error',
        'js.error_mic':         'Hindi ma-access ang mic. Paki-check ang browser permissions mo.',
        'planner.dt_hr':        'HR',
        'planner.dt_min':       'MIN',
        'planner.dt_am':        'AM',
        'planner.dt_pm':        'PM',
        'planner.dt_leave':     'Alis',
        'planner.dt_arrive':    'Dating',
        'planner.dt_now':       'Ngayon',
        'planner.dt_set':       'I-set ang Schedule',
        'planner.schedule_journey': 'I-schedule ang Byahe',
        'planner.depart_at_pre': 'Aalis ng',
        'planner.arrive_by_pre': 'Dating ng',
        'planner.calculating_route': 'Hinahanap ang ruta...',
        'planner.badge_fastest': 'Pinakamabilis',
        'planner.badge_cheapest': 'Pinakamura',
        'planner.badge_least_transfer': 'Pinakakaunting Lipat',
        'planner.fare_breakdown': 'Breakdown ng Pamasahe',
        'planner.fare_disclaimer': 'Estimated ang pamasahe. Pwedeng mag-iba.',
        'planner.mark_done': 'Tapos Na',
        'planner.leg_progress': 'Bahagi {current} ng {total}',
        'planner.arrival_title': 'Nakarating na sa Destinasyon!',
        'planner.no_routes': 'Walang nahanap na ruta. Paki-check ang nilagay mong destinasyon.',
        'planner.tracking_unavailable': 'Walang GPS tracking. Manual mode tayo ngayon.',
        'planner.reached_landmark': "Nasa {name} ka na. Proceed na tayo sa next step.",
        'planner.recenter': 'I-gitna sa Map',

        'js.server_wakeup':     'Ginigising ko pa lang ang server. Pasensya na sa antala! Pakisubukan ulit mag-send ng message pagkalipas ng 10-20 seconds. 😅',
        'js.osm_attribution':   "🗺️ Ang search results ay suportado ng <a href='https://www.openstreetmap.org' target='_blank'>OpenStreetMap</a> / Nominatim"
    }

};

// Apply the stored or given language to all [data-i18n] elements
function applyLang(lang) {
    const dict = window.translations[lang];
    if (!dict) return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!dict[key]) return;

        const attr = el.getAttribute('data-i18n-attr');
        if (attr) {
            el.setAttribute(attr, dict[key]);
        } else {
            // Special handling for HTML strings in translations
            el.innerHTML = dict[key];
        }
    });

    // Update all toggle buttons (Desktop & Mobile)
    document.querySelectorAll('#langToggleBtn, .mobile-lang-toggle').forEach(btn => {
        const active = btn.querySelector('.lang-active');
        const other  = btn.querySelector('.lang-other');
        const flag   = btn.querySelector('.lang-flag');
        if (active) active.textContent = lang === 'en' ? 'EN' : 'TL';
        if (other)  other.textContent  = lang === 'en' ? 'TL' : 'EN';
        if (flag)   flag.textContent   = lang === 'en' ? '🌐' : '🇵🇭';
        
        // Visual indicator
        btn.classList.remove('en-mode', 'tl-mode');
        btn.classList.add(lang === 'en' ? 'en-mode' : 'tl-mode');
    });

    // Update active states on dropdown items
    document.querySelectorAll('.lang-dropdown-item').forEach(item => {
        const itemLang = item.getAttribute('data-lang');
        if (itemLang === lang) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    localStorage.setItem('calzada_lang', lang);
    document.documentElement.lang = lang === 'en' ? 'en' : 'tl';

    // Dispatch event for other scripts to re-run localized logic
    window.dispatchEvent(new CustomEvent('calzada_lang_changed', { detail: { lang } }));
}

/* ---------------------------------------------------------------------------
 * Language switch transition
 *
 * applyLang() above is a synchronous pass over the [data-i18n] nodes reading an
 * in-memory dictionary, so a language switch is instant. That means a spinner
 * would be theatre, and an artificial delay would make an instant action feel
 * slow. What the swap did look like was a hard flicker, so this wraps it in a
 * short cross-fade: 150ms out, swap, 150ms in.
 *
 * Nothing is blocked while it runs - only opacity animates, so links, buttons
 * and scrolling all keep working. Under prefers-reduced-motion the fade is
 * skipped entirely and the swap happens immediately, with no timers at all.
 * ------------------------------------------------------------------------- */
const LANG_FADE_MS = 150;
let langFadeTimers = [];

function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function clearLangFade() {
    langFadeTimers.forEach(clearTimeout);
    langFadeTimers = [];
    document.documentElement.classList.remove('lang-swapping', 'lang-swapping-out');
}

/**
 * User-initiated language change: same swap as applyLang(), with a fade around it.
 * applyLang() itself is left untouched so page-load init and any external caller
 * still get the plain, immediate behaviour.
 */
function applyLangWithTransition(lang) {
    if (prefersReducedMotion()) {
        applyLang(lang);
        return;
    }

    const root = document.documentElement;

    // A second click mid-fade must not strand the page at opacity 0.
    langFadeTimers.forEach(clearTimeout);
    langFadeTimers = [];

    root.classList.add('lang-swapping');

    // Let the transition rule land before opacity flips, or the browser jumps straight to 0.
    requestAnimationFrame(() => {
        root.classList.add('lang-swapping-out');

        langFadeTimers.push(setTimeout(() => {
            applyLang(lang);
            root.classList.remove('lang-swapping-out');

            langFadeTimers.push(setTimeout(() => {
                root.classList.remove('lang-swapping');
            }, LANG_FADE_MS));
        }, LANG_FADE_MS));
    });
}

// If the page is restored from bfcache mid-fade, don't come back invisible.
window.addEventListener('pageshow', clearLangFade);

/**
 * Global helper to get a translation by key
 */
window.t = function(key) {
    const lang = localStorage.getItem('calzada_lang') || 'en';
    const dict = window.translations[lang];
    return dict ? (dict[key] || key) : key;
};

/**
 * Global helper to get current language
 */
window.getCurrentLang = function() {
    return localStorage.getItem('calzada_lang') || 'en';
};

function toggleLang() {
    const current = localStorage.getItem('calzada_lang') || 'en';
    applyLangWithTransition(current === 'en' ? 'tl' : 'en');
}
window.applyLang = applyLang;
window.applyLangWithTransition = applyLangWithTransition;
window.toggleLang = toggleLang;

// Init — works whether DOM is ready or not
function initI18n() {
    const saved = localStorage.getItem('calzada_lang') || 'en';
    applyLang(saved);

    // Initial listener setup
    document.addEventListener('click', (e) => {
        // 1. Toggle dropdown menu open/close
        const toggleBtn = e.target.closest('#langToggleBtn, .mobile-lang-toggle');
        if (toggleBtn) {
            e.stopPropagation();
            const container = toggleBtn.closest('.lang-dropdown-container');
            if (container) {
                const isOpen = container.classList.contains('open');
                document.querySelectorAll('.lang-dropdown-container').forEach(c => {
                    c.classList.remove('open');
                    const btn = c.querySelector('button');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                });
                if (!isOpen) {
                    container.classList.add('open');
                    toggleBtn.setAttribute('aria-expanded', 'true');
                }
            } else {
                toggleLang();
            }
            return;
        }

        // 2. Select language from dropdown item
        const dropdownItem = e.target.closest('.lang-dropdown-item');
        if (dropdownItem) {
            e.stopPropagation();
            const selectedLang = dropdownItem.getAttribute('data-lang');
            if (selectedLang) {
                applyLangWithTransition(selectedLang);
            }
            document.querySelectorAll('.lang-dropdown-container').forEach(c => {
                c.classList.remove('open');
                const btn = c.querySelector('button');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            });
            return;
        }

        // 3. Click outside -> close any open dropdowns
        if (!e.target.closest('.lang-dropdown-container')) {
            document.querySelectorAll('.lang-dropdown-container').forEach(c => {
                c.classList.remove('open');
                const btn = c.querySelector('button');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            });
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
} else {
    initI18n();
}
