/**
 * Calzada Language Toggle (i18n)
 * - Stores preference in localStorage
 * - Updates all [data-i18n] elements on the page
 * - Navbar links are never translated (by design)
 */

window.translations = {
    en: {
        // === index.html ===
        'hero.title':           'Your <span class="title-highlight shimmer-text">Commuting Guide</span> in Calamba.',
        'hero.subtitle':        'Find routes, fares, and connections for Jeepneys, Buses, P2P, UV Express, and Tricycles.',
        'hero.search.placeholder': 'Where do you want to go?',
        'about.heading':        'What is Calzada?',
        'about.body':           '<strong>Calzada</strong> is your reliable commuter guide platform in Calamba and nearby cities. Easily plan your trip with fare information and exact transit modes — jeepney, bus, modern jeep, UV, or tricycle!',
        'about.learn_more':     'Learn More →',
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
        'steps.pill':           'Simple & Fast',
        'steps.heading':        'Plan your commute in 3 easy steps',
        'steps.sub':            'No more guessing fares or routes. Calzada lays it all out, clear and simple.',
        'steps.1.title':        'Enter Your Destination',
        'steps.1.desc':         'Type where you want to go. Calzada recognizes landmarks, barangays, terminals, and more.',
        'steps.2.title':        'Compare Route Options',
        'steps.2.desc':         'See multiple route suggestions with estimated travel time, fare cost, and number of transfers.',
        'steps.3.title':        'Go & Travel with Confidence',
        'steps.3.desc':         'Follow step-by-step directions. Multi-modal journeys combining jeepney, P2P, and tricycle are fully supported.',
        'features.routes':      'Routes Covered',
        'features.modes':       'Transit Modes',
        'features.barangays':   'Barangays',
        'features.fare':        'Fare Info',
        'features.realtime':    'Real-time',
        'footer.tagline':       'Your reliable commuter guide platform in Calamba.',
        'footer.nav.heading':   'Navigation',
        'footer.nav.home':      'Home',
        'footer.nav.p2p':       'P2P Paths',
        'footer.nav.submit':    'Submit a Route',
        'footer.nav.dyiptok':   'Ask DyipTok',
        'footer.nav.about':     'About Us',
        'footer.nav.places':    'Place Finder',
        'footer.nav.faq':       'FAQs',
        'footer.contact.heading': 'Contact Us',
        'footer.copyright':     '© 2026 Calzada. All rights reserved.',
        // === chat ===
        'chat.greeting':        "Hello! I'm DyipTok. Where do you want to go today?",
        'chat.placeholder':     'Type a message...',
        'chip.route':           'How to use route search?',
        'chip.free':            'Is Calzada free?',
        'chip.modes':           'What transport modes are included?',
        'chip.p2p':             'P2P bus location?',
        'chip.platform':        'What is this platform for?',
        // === about.html ===
        'about_page.title':        'About',
        'about_page.p1':           '<strong>Calzada</strong> is a commuter guide platform envisioned to transform the way people travel across Calamba and nearby cities. Rooted in the word <em>calzada</em>, meaning road or pathway, the brand embodies the idea of direction, clarity, and movement.',
        'about_page.p2':           'The platform integrates multiple modes of transport, including <strong>jeepneys, buses, P2P, UV Express, and tricycles</strong>. Calzada offers a route suggestion feature that presents different travel options based on estimated duration, fare cost, and walking distance, helping commuters compare alternatives and choose the most convenient journey.',
        'about_page.p3':           'Calzada also highlights <strong>multi-modal navigation</strong>, enabling commuters to combine different transport modes in a single journey. The platform is built with a responsive design, making it accessible on both desktop and mobile devices, and features a user-friendly interface that simplifies route planning even for first-time users.',
        'about_page.goal.heading': 'Goal',
        'about_page.goal.body':    'The primary goal of Calzada is to empower commuters by providing accurate, transparent, and easy-to-use transit information. By centralizing data on routes, fares, and transport options, the website aims to reduce commuting stress, promote informed decision-making, and improve overall mobility in the city. Ultimately, Calzada seeks to become a trusted digital companion for everyday commuters, helping them save time, manage expenses, and travel with confidence.',
        // === faq.html ===
        'faq.heading':          'Frequently Asked Questions',
        'faq1.q':               'What is Calzada?',
        'faq1.a':               'Calzada is a commuter guide platform envisioned to transform the way people travel across Calamba and nearby cities. It provides route suggestions, fare information, and transport options for jeepneys, buses, P2P, UV Express, and tricycles to help commuters plan their trips with direction, clarity, and movement.',
        'faq2.q':               'How do I use the route search feature?',
        'faq2.a':               'Simply enter your starting point and destination in the search bar, then click the button to begin. The system generates several route options showing travel time, fare cost, and walking distance.',
        'faq_fares.q':          'Does the website show exact fares?',
        'faq_fares.a':          'The platform provides estimated fares based on available data. Actual fares may vary slightly depending on operator policies, but the goal is to give commuters a clear idea of expected costs before traveling.',
        'faq_mobile.q':         'Can I access Calzada on mobile devices?',
        'faq_mobile.a':         'Yes. The website is built with a responsive design that adjusts to different screen sizes — desktop, laptop, or smartphone.',
        'faq_modes.q':          'What transport modes are included?',
        'faq_modes.a':          'Currently, Calzada supports jeepneys, buses, P2P, UV Express, and tricycles — the most common commuting options in Calamba and nearby areas.',
        'faq3.q':               'Is Calzada free to use?',
        'faq3.a':               'Yes. The platform is completely free for commuters and does not require any subscription.',
        'faq4.q':               'What is the main goal of Calzada?',
        'faq4.a':               'The primary goal is to empower commuters with accurate, transparent, and easy-to-use transit information — reducing commuting stress and improving mobility in the city.',
        // === places.html ===
        'places.hero_title':    'Where will you ride, where will you get off?',
        'places.hero_subtitle': 'From sakayan to galaan — your smart guide to Calamba\'s terminals and must-visit places',
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
        'planner.reminders_1':   'Ask the driver if they will pass by your destination.',
        'planner.reminders_2':   'Prepare exact fare to avoid change issues.',
        'planner.reminders_3':   'Take care of your belongings inside the vehicle.',
        'planner.reminders_4':   'Check route updates for traffic or rerouting.',
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
        'login.agree_label':     'I agree to the <a href="#">Terms</a> & <a href="#">Privacy Policy</a>',
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
        'about_page.tagline': 'Your daily commute, simplified.',
        'about_page.why.heading': 'Why Calzada?',
        'about_page.why.card1.title': 'Direction',
        'about_page.why.card1.desc': 'You won\'t get lost – every route is clear and accurate.',
        'about_page.why.card2.title': 'Transparency',
        'about_page.why.card2.desc': 'No hidden charges. You know the exact fare before you ride.',
        'about_page.why.card3.title': 'Community',
        'about_page.why.card3.desc': 'Made for commuters, by commuters. Free and accessible to all.',
        'js.server_wakeup':     "I'm still waking up the server. Sorry for the delay! Please try sending your message again in 10-20 seconds. 😅",
        'js.osm_attribution':   "🗺️ Search results powered by <a href='https://www.openstreetmap.org' target='_blank'>OpenStreetMap</a> / Nominatim"
    },

    tl: {
        // === index.html ===
        'hero.title':           'Ang Iyong <span class="title-highlight shimmer-text">Gabay sa Commute</span> sa Calamba.',
        'hero.subtitle':        'Hanapin ang mga ruta, pamasahe, at koneksyon para sa Jeepney, Bus, P2P, UV Express, at Tricycle.',
        'hero.search.placeholder': 'Saan ka pupunta?',
        'about.heading':        'Ano ang Calzada?',
        'about.body':           'Ang <strong>Calzada</strong> ay ang iyong maaasahang commuter guide platform dito sa Calamba at karatig-bayan. Madaliang mai-plano ang biyahe gamit ang aming platform na nagpapakita ng presyo ng pamasahe at eksaktong transit mode — jeepney, bus, modern jeep, UV, o tricycle man \'yan!',
        'about.learn_more':     'Alamin Pa →',
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
        'steps.pill':           'Simple at Mabilis',
        'steps.heading':        'Planuhin ang iyong biyahe sa 3 simpleng hakbang',
        'steps.sub':            'Wala nang hula-hula sa pamasahe o ruta. Malinaw at simple ang lahat sa Calzada.',
        'steps.1.title':        'Ilagay ang Iyong Destinasyon',
        'steps.1.desc':         'I-type ang iyong destinasyon. Kinikilala ng Calzada ang mga landmark, barangay, terminal, at iba pa.',
        'steps.2.title':        'Ikumpara ang mga Ruta',
        'steps.2.desc':         'Tingnan ang iba\'t ibang route na may tinatayang oras ng biyahe, pamasahe, at bilang ng transfer.',
        'steps.3.title':        'Bumiyahe nang Panatag',
        'steps.3.desc':         'Sundan ang hakbang-hakbang na direksyon. Sinusuportahan ang multi-modal na biyahe tulad ng jeep, P2P, at tricycle.',
        'features.routes':      'Mga Rutang Sakop',
        'features.modes':       'Transit Modes',
        'features.barangays':   'Mga Barangay',
        'features.fare':        'Impormasyon sa Pamasahe',
        'features.realtime':    'Real-time',
        'footer.tagline':       'Ang iyong maaasahang gabay sa commute sa Calamba.',
        'footer.nav.heading':   'Navigation',
        'footer.nav.home':      'Home',
        'footer.nav.p2p':       'P2P Paths',
        'footer.nav.submit':    'Mag-submit ng Ruta',
        'footer.nav.dyiptok':   'Magtanong sa DyipTok',
        'footer.nav.about':     'Tungkol sa Amin',
        'footer.nav.places':    'Place Finder',
        'footer.nav.faq':       'FAQs',
        'footer.contact.heading': 'Makipag-ugnayan',
        'footer.copyright':     '© 2026 Calzada. Lahat ng karapatan ay nakalaan.',
        
        // === chat ===
        'chat.greeting':        "Kamusta! Ako si DyipTok. Saan ka pupunta ngayon?",
        'chat.placeholder':     'Mag-type ng mensahe...',
        'chip.route':           'Paano gamitin ang route search?',
        'chip.free':            'Libre ba ang Calzada?',
        'chip.modes':           'Anong transport modes ang available?',
        'chip.p2p':             'Saan ang location ng P2P bus?',
        'chip.platform':        'Para saan itong platform?',
        
        // === about.html ===
        'about_page.title':        'Tungkol Saan',
        'about_page.p1':           'Ang <strong>Calzada</strong> ay isang commuter guide platform na ginawa para baguhin ang paraan ng pagbiyahe sa Calamba at karatig-bayan. Galing sa salitang <em>calzada</em> (daan o landas), sinisimbolo nito ang direksyon, linaw, at tuloy-tuloy na byahe.',
        'about_page.p2':           'Pinagsama ng platform ang iba\'t ibang paraan ng transportasyon, kabilang ang <strong>jeepney, bus, P2P, UV Express, at tricycle</strong>. Nagbibigay ang Calzada ng route suggestions base sa tagal ng byahe, pamasahe, at layo ng lalakarin.',
        'about_page.p3':           'Tinutulungan din ng Calzada na mag-<strong>multi-modal navigation</strong>, kung saan pwedeng pag-konektahin ang iba\'t ibang sakay sa isang byahe. Responsive ang design nito kaya pwede mong gamitin sa phone o computer nang walang kahirap-hirap.',
        'about_page.goal.heading': 'Layunin',
        'about_page.goal.body':    'Ang pangunahing layunin ng Calzada ay tulungan ang mga commuter sa pamamagitan ng tama, transparent, at madaling gamiting transit information. Para mabawasan ang stress sa pag-commute, maiplano ang byahe nang maayos, at mapabilis ang ikot sa lungsod. Ang pangarap namin ay maging number one digital buddy ng bawat araw-araw na commuter.',
        
        // === faq.html ===
        'faq.heading':          'Mga Madalas na Katanungan (FAQs)',
        'faq1.q':               'Ano ang Calzada?',
        'faq1.a':               'Ang Calzada ay isang commuter guide platform na ginawa para tulungan ang mga bumibyahe sa Calamba at karatig-bayan. Nagbibigay ito ng mga ruta, pamasahe, at options para sa jeepney, bus, P2P, UV Express, at tricycle.',
        'faq2.q':               'Paano gamitin ang route search?',
        'faq2.a':               'I-type lang kung saan ka manggagaling at kung saan ka pupunta sa search bar, tapos i-click ang button. Magpapakita ang system ng mga options na may estimated na oras, pamasahe, at lakad.',
        'faq_fares.q':          'Eksakto ba ang pamasahe na pinapakita ng website?',
        'faq_fares.a':          'Estimated fare lang ang ipinapakita base sa available data natin mula sa LTFRB. Pwedeng magbago nang konti depende sa mga operator, pero sapat na ito para may idea ka kung magkano aabutin.',
        'faq_mobile.q':         'Pwede ko bang gamitin ang Calzada sa phone?',
        'faq_mobile.a':         'Oo naman! Ginawa ang website natin na responsive kaya sakto ang itsura nito mapa-cellphone, tablet, o laptop man gamit mo.',
        'faq_modes.q':          'Anong mga sasakyan ang kasama rito?',
        'faq_modes.a':          'Sa ngayon, kasama sa Calzada ang mga jeepney, bus, P2P, UV Express, at tricycle — ang mga pinakakaraniwang sinasakyan dito sa Calamba.',
        'faq3.q':               'May bayad ba ang paggamit ng Calzada?',
        'faq3.a':               'Wala. Libre itong gamitin para sa lahat ng commuters at walang kailangang subscription.',
        'faq4.q':               'Ano ang main goal ng Calzada?',
        'faq4.a':               'Gusto lang namin padaliin ang buhay ng mga commuter by providing accurate and easy-to-use transit info, para less stress at mas mabilis ang byahe.',
        
        // === places.html ===
        'places.hero_title':    'Saan ka sasakay, saan ka bababa?',
        'places.hero_subtitle': 'Mula sakayan hanggang galaan — ito ang smart guide mo para sa mga terminal at sikat na lugar sa Calamba.',
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
        'planner.reminders_1':   'Tanungin ang driver kung dadaan sila sa bababaan mo bago sumakay.',
        'planner.reminders_2':   'Maghanda ng barya para iwas-abala sa sukli.',
        'planner.reminders_3':   'Laging ingatan ang iyong mga gamit sa loob ng byahe.',
        'planner.reminders_4':   'I-check ang traffic updates bago umalis.',
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
        'login.agree_label':     'Pumapayag ako sa <a href="#">Terms</a> at <a href="#">Privacy Policy</a>',
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
        'about_page.tagline': 'Ang araw-araw mong commute, pinadali.',
        'about_page.why.heading': 'Bakit Calzada?',
        'about_page.why.card1.title': 'Direksyon',
        'about_page.why.card1.desc': 'Hindi ka na maliligaw – lahat ng ruta klaro at tumpak.',
        'about_page.why.card2.title': 'Transparency',
        'about_page.why.card2.desc': 'Walang gulatan. Alam mo na agad ang pamasahe bago ka pa sumakay.',
        'about_page.why.card3.title': 'Komunidad',
        'about_page.why.card3.desc': 'Ginawa ng commuters para sa commuters. Libre para sa lahat.',
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
        if (active) active.textContent = lang === 'en' ? 'EN' : 'TL';
        if (other)  other.textContent  = lang === 'en' ? 'TL' : 'EN';
        
        // Visual indicator
        btn.classList.remove('en-mode', 'tl-mode');
        btn.classList.add(lang === 'en' ? 'en-mode' : 'tl-mode');
    });

    localStorage.setItem('calzada_lang', lang);
    document.documentElement.lang = lang === 'en' ? 'en' : 'tl';

    // Dispatch event for other scripts to re-run localized logic
    window.dispatchEvent(new CustomEvent('calzada_lang_changed', { detail: { lang } }));
}

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
    applyLang(current === 'en' ? 'tl' : 'en');
}

// Init — works whether DOM is ready or not
function initI18n() {
    const saved = localStorage.getItem('calzada_lang') || 'en';
    applyLang(saved);

    // Initial listener setup
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#langToggleBtn, .mobile-lang-toggle');
        if (btn) {
            toggleLang();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
} else {
    initI18n();
}
