/**
 * server/routie-faqs-extra.js
 *
 * More FAQ answers for Routie. Every fact here comes from Calzada's own code, data or policy text
 * (source noted per entry). Nothing is guessed: where Calzada has no data (jeep schedules,
 * tricycle fares), the answer says so.
 *
 * Shape: same as FAQS in routie-knowledge.js ({ id, triggers, en, tl }) plus:
 *   source        where the facts come from (for reviewers, never shown to users)
 *   needsConfirm  true = Drei has not confirmed a fact in it yet. Skipped at load until set to false.
 *
 * Placeholders in {braces} are filled at load from public/data/jeepney-fares.json through
 * fare-info.js / fare-calc.js (see fillFareVars in the integration), so a fare change needs no edit
 * here:
 *   {baseFare} {perKm} {discBaseFare} {discPerKm} {discFirstFare}  pesos, as fare-calc formatPeso ("₱14", "₱11.25")
 *   {baseKm} {maxKm} {discountPercent} {roundCentavos}             numbers
 *   {effectiveDate}                                                "September 28, 2026" / "Setyembre 28, 2026"
 *
 * Trigger rules (checked by scripts/test-routie.mjs):
 *   - Each trigger is matched as a whole phrase in the normalized message, never as part of a word.
 *   - At least two words, except a few distinctive single words listed in SINGLE_WORD_OK in the test.
 *   - No trigger may be a place name, place alias or barangay name.
 *   - The longest matching trigger wins, across all FAQs.
 */

const FAQS_EXTRA = [
    // ── Fares ────────────────────────────────────────────────────────────────────────────────
    {
        id: 'fare_discount',
        source: 'jeepney-fares.json; i18n fares_page.computed_discounted / computed_note; planner-transit.js fare line',
        triggers: [
            'student discount', 'discount ng estudyante', 'discount sa estudyante', 'senior discount',
            'pwd discount', 'discounted fare', 'may discount ba', 'may diskwento ba', 'sino ang may discount',
            'who gets a discount', 'who gets the discount', 'fare discount', 'diskwento sa pamasahe',
            'discount sa jeep', 'student fare', 'pamasahe ng estudyante', 'senior citizen fare',
            'pamasahe ng senior', 'pamasahe ng pwd', 'pamasahe ng student', 'discount on weekends', 'discount kahit sabado', 'discount kahit linggo', 'discount sa holiday'
        ],
        en: 'Students, senior citizens and PWDs get a {discountPercent}% discount on jeepney fares: {discBaseFare} for the first {baseKm} km, plus {discPerKm} for each additional km. Because fares are rounded to the nearest {roundCentavos} centavos, the discounted fare for the first {baseKm} km shows as {discFirstFare}. Students get the discount every day, including weekends and holidays. In the Planner, every jeepney option shows both the regular and the discounted fare. Fares are estimates.',
        tl: 'May {discountPercent}% na diskwento sa pamasahe sa jeep ang mga estudyante, senior citizen, at PWD: {discBaseFare} para sa unang {baseKm} km, dagdag na {discPerKm} sa bawat karagdagang km. Dahil niroround sa pinakamalapit na {roundCentavos} sentimos, {discFirstFare} ang lumalabas na discounted fare para sa unang {baseKm} km. Araw-araw ang diskwento ng estudyante, kasama ang weekend at holiday. Sa Planner, makikita sa bawat opsyon ng jeep ang regular at discounted na pamasahe. Tantiya lang ang mga pamasahe.'
    },
    {
        id: 'fare_rounding',
        source: 'fare-calc.js countedKm / roundToStep; i18n fares_page.calc_hint, computed_note',
        triggers: [
            'bakit 11.25', 'why 11.25', 'bakit 11 25', 'why 11 25', 'rounded fare', 'rounding ng pamasahe',
            'paano niroround', 'nearest 25 centavos', 'part of a km', 'bahagi ng km', 'how is distance counted',
            'paano binibilang ang km', 'paano binibilang ang kilometro', 'how are kilometers counted',
            'is the fare rounded', 'niroround ba ang pamasahe'
        ],
        en: 'Calzada counts distance in whole kilometres: any part of a km counts as a full km (4.2 km counts as 5 km). The fare is then rounded to the nearest {roundCentavos} centavos. That is why the discounted fare for the first {baseKm} km shows as {discFirstFare} instead of {discBaseFare}.',
        tl: 'Buong kilometro ang bilang ng Calzada: ang bahagi ng isang km ay binibilang na isang buong km (ang 4.2 km ay 5 km). Pagkatapos, niroround ang pamasahe sa pinakamalapit na {roundCentavos} sentimos. Kaya {discFirstFare} ang discounted fare para sa unang {baseKm} km at hindi {discBaseFare}.'
    },
    {
        id: 'fare_source',
        source: 'jeepney-fares.json source/effectiveDate/guidePdf; i18n fares_page.source_statement, source_clarification',
        triggers: [
            'fare guide', 'ltfrb fare guide', 'saan galing ang pamasahe', 'source of fares', 'source of the fares',
            'fare increase', 'dagdag pasahe', 'dagdag na pamasahe', 'bagong pamasahe', 'new fare rates',
            'fare matrix', 'fare table', 'kailan nagtaas ang pamasahe', 'when did fares go up', 'ltfrb hotline',
            'updated ba ang pamasahe', 'are the fares updated', 'latest fare'
        ],
        en: 'Calzada\'s jeepney fares come from the LTFRB PUJ General Fare Guide for traditional jeepneys in Region IV-A (CALABARZON), effective {effectiveDate}. The Fares page (calzadaph.com/fares) has the full fare table, a fare estimator and the official guide as a PDF. For clarification, visit www.ltfrb.gov.ph or call the LTFRB hotline at 1342.',
        tl: 'Galing ang pamasahe sa Calzada sa LTFRB PUJ General Fare Guide para sa tradisyunal na jeep sa Region IV-A (CALABARZON), epektibo noong {effectiveDate}. Nasa Fares page (calzadaph.com/fares) ang buong fare table, fare estimator, at ang opisyal na guide bilang PDF. Para sa paglilinaw, bisitahin ang www.ltfrb.gov.ph o tumawag sa LTFRB hotline sa 1342.'
    },
    {
        id: 'fare_estimator',
        source: 'i18n fares_page.estimate_title, calc_hint; routie-knowledge.js fare step (distance in km)',
        triggers: [
            'fare calculator', 'fare estimator', 'compute my fare', 'calculate my fare', 'i compute ang pamasahe',
            'kwentahin ang pamasahe', 'kuwentahin ang pamasahe', 'paano malalaman ang pamasahe',
            'how do i know my fare', 'how do i check the fare', 'paano tingnan ang pamasahe'
        ],
        en: 'Three ways: tell me the distance (for example "magkano ang 7 km"), use the estimator on the Fares page (calzadaph.com/fares, 1 to {maxKm} km), or plan the trip in the Planner (calzadaph.com/planner) to see the fare of the actual route, regular and discounted. Fares are estimates.',
        tl: 'Tatlong paraan: sabihin sa akin ang layo (halimbawa "magkano ang 7 km"), gamitin ang estimator sa Fares page (calzadaph.com/fares, 1 hanggang {maxKm} km), o i-plan ang biyahe sa Planner (calzadaph.com/planner) para makita ang pamasahe ng mismong ruta, regular at may diskwento. Tantiya lang ang mga pamasahe.'
    },
    {
        id: 'fare_other_modes',
        source: 'faq_modes.a "Jeepney and walking"; validation-plan Phase 4 (Tricycle removed)',
        triggers: [
            'tricycle', 'traysikel', 'trike', 'tricycle fare', 'pamasahe sa tricycle', 'bus fare', 'pamasahe sa bus',
            'uv express', 'van fare', 'taxi fare', 'grab car', 'angkas', 'joyride fare', 'e jeep fare'
        ],
        en: 'Calzada covers traditional jeepney rides and walking only, so I don\'t have tricycle, bus, UV Express, taxi or motorcycle-taxi fares. Tricycle fares can differ per route, so please ask the driver before you ride.',
        tl: 'Jeep at paglalakad lang ang sakop ng Calzada, kaya wala akong pamasahe ng tricycle, bus, UV Express, taxi, o motorcycle taxi. Maaaring iba-iba ang pamasahe sa tricycle depende sa ruta, kaya magtanong muna sa drayber bago sumakay.'
    },

    // ── Planner and trips ────────────────────────────────────────────────────────────────────
    {
        id: 'plan_without_account',
        source: 'guest-planner-auth-legal-plan Phase 1; legal-modal privacy (anyone can browse and plan without an account); feedback.gate',
        triggers: [
            'need an account', 'kailangan ba ng account', 'kailangan bang mag sign in', 'kailangan ba mag sign in',
            'kailangan ba mag login', 'kailangan bang mag login', 'do i need to sign in', 'do i need to log in',
            'do i need to login', 'without an account', 'walang account', 'as a guest', 'bilang guest', 'guest mode',
            'can i use it without signing in', 'pwede ba walang account'
        ],
        en: 'You can browse places and plan routes without an account. Signing in is needed only to start a journey with live navigation (Start Journey), so the trip can be kept in My Trips, and to leave feedback or register a business.',
        tl: 'Puwede kang tumingin ng mga lugar at mag-plan ng ruta kahit walang account. Kailangan lang mag-sign in para mag-Start Journey (live navigation) para maitabi ang biyahe sa My Trips, at para magbigay ng feedback o magrehistro ng negosyo.'
    },
    {
        id: 'live_navigation',
        source: 'guest-planner-auth-legal-plan (Start Journey gate); terminal-picker-plan (auto-switch while on the first walk); legal-modal (GPS never saved)',
        triggers: [
            'live navigation', 'start journey', 'paano mag start ng journey', 'paano gamitin ang start journey',
            'turn by turn', 'gps navigation', 'navigation mode', 'sinusundan ba ang location', 'follow my location',
            'track my trip', 'i track ang biyahe'
        ],
        en: 'After you plan a route, tap Start Journey to follow it step by step on the map. While the journey is on, Calzada uses your phone\'s location to show your progress and the next step; your exact location is never saved. You need to be signed in and allow location access.',
        tl: 'Pagkatapos mag-plan ng ruta, pindutin ang Start Journey para sundan ito nang hakbang-hakbang sa mapa. Habang naka-on ang journey, ginagamit ng Calzada ang location ng phone mo para ipakita ang progreso at susunod na hakbang; hindi kailanman sine-save ang eksaktong location mo. Kailangang naka-sign in ka at naka-allow ang location.'
    },
    {
        id: 'route_options',
        source: 'transit-engine.js rank(): MAX_OPTIONS 3, balanced cost (fare, minutes, transfers, walking), cheapest, fastest',
        triggers: [
            'recommended cheapest fastest', 'ano ang recommended', 'what does recommended mean', 'what is recommended',
            'difference between cheapest and fastest', 'cheapest vs fastest', 'bakit recommended',
            'paano pinipili ang recommended', 'how is the recommended route chosen', 'route options',
            'pagkakaiba ng cheapest at fastest', 'pinakamura at pinakamabilis', 'ano ang cheapest at fastest'
        ],
        en: 'For a jeepney trip the Planner shows up to 3 options. Cheapest has the lowest fare, Fastest has the shortest travel time, and Recommended has the best balance of fare, travel time, transfers and walking. An option that is worse than another on fare, time and transfers all at once is not shown.',
        tl: 'Para sa biyahe sa jeep, hanggang 3 opsyon ang ipinapakita ng Planner. Pinakamura ang may pinakamababang pamasahe, Pinakamabilis ang may pinakamaikling oras, at Recommended ang may pinakamagandang balanse ng pamasahe, oras, transfer, at lakad. Hindi na ipinapakita ang opsyong talo sa iba sa pamasahe, oras, at transfer nang sabay-sabay.'
    },
    {
        id: 'travel_time',
        source: 'transit-engine.js JEEP_SPEED_KPH 20, WALK_SPEED_KPH 4, BOARDING_BUFFER_MIN 3, TRANSFER_EXTRA_MIN 2',
        triggers: [
            'how is travel time computed', 'how is the travel time computed', 'paano kinukwenta ang oras',
            'paano kinakalkula ang oras', 'accurate ba ang oras', 'accurate ba ang eta', 'is the eta accurate',
            'is the travel time accurate', 'gaano katagal ang biyahe', 'how long is the trip', 'travel time estimate'
        ],
        en: 'Travel times are estimates: about 20 km/h on a jeepney and about 4 km/h walking (15 minutes per km), plus about 3 minutes per jeepney ride for waiting and boarding and 2 minutes for each transfer. Traffic can make a trip longer. For the time of a specific trip, plan it in the Planner (calzadaph.com/planner) or tell me where you\'re coming from and going.',
        tl: 'Tantiya lang ang oras ng biyahe: mga 20 km/h sa jeep at mga 4 km/h sa paglalakad (15 minuto bawat km), dagdag na mga 3 minuto bawat sakay ng jeep para sa paghihintay at pagsakay, at 2 minuto bawat transfer. Puwedeng humaba ang biyahe dahil sa trapiko. Para sa oras ng isang tiyak na biyahe, i-plan ito sa Planner (calzadaph.com/planner) o sabihin sa akin kung saan ka manggagaling at pupunta.'
    },
    {
        id: 'walk_only_trips',
        source: 'no-jeep-areas.md (noJeepFrom, NO_ROAD_BOARDING_AREAS Uno); transit-engine.js MIN_RIDE_M 400, MAX_ACCESS_WALK_M 1200',
        triggers: [
            'walang jeep', 'bakit lakad lang', 'bakit walang jeep', 'why walk only', 'why no jeepney', 'why no jeep',
            'why is it walking only', 'lakad lang ba', 'walking only', 'bakit maglalakad', 'no jeep option',
            'saan pwede pumara', 'pwede bang pumara kahit saan', 'can i flag a jeep anywhere'
        ],
        en: 'Some trips are walk-only on purpose. Around Crossing and SM, jeepneys load only at the terminals, not on the road, so for short trips there walking is better. No jeepney goes from the poblacion barangays (Barangay 2 to 7, San Jose and San Juan) toward Uno, Real or Halang, so trips from there are a walk. Rides shorter than about 400 m are not suggested, and the walk to a jeep is kept under about 1.2 km.',
        tl: 'Sinadya ang ilang biyaheng lakad lang. Sa Crossing at SM, sa terminal lang nagsasakay ang jeep, hindi sa kalsada, kaya mas mainam maglakad para sa maiikling biyahe roon. Walang jeep mula sa mga barangay sa poblacion (Barangay 2 hanggang 7, San Jose, at San Juan) papuntang Uno, Real, o Halang, kaya lakad ang biyahe mula roon. Hindi na iminumungkahi ang sakay na mas maikli sa mga 400 m, at hindi lalampas sa mga 1.2 km ang lakad papunta sa jeep.'
    },
    {
        id: 'crossing_the_highway',
        source: 'walk-routing-plan.md ground truth (Drei, Nov 4)',
        triggers: [
            'footbridge', 'foot bridge', 'paano tumawid', 'saan tatawid', 'tumawid sa crossing', 'cross the highway',
            'cross the national highway', 'how do i cross', 'pedestrian lane', 'overpass sa crossing'
        ],
        en: 'At the Calamba Crossing junction, people cross only by the footbridge (its stairs are usable), and the SM City Calamba footbridge continues it across National Highway 1 on the SM side. In Real (by Jollibee) and Halang (by Chicken Joo), people cross at the pedestrian lane by the stoplight. The Planner\'s walking directions follow these crossings.',
        tl: 'Sa Calamba Crossing junction, sa footbridge lang tumatawid ang mga tao (puwedeng gamitin ang mga hagdan nito), at tuloy-tuloy ito sa SM City Calamba footbridge patawid ng National Highway 1 sa gilid ng SM. Sa Real (tabi ng Jollibee) at Halang (tabi ng Chicken Joo), sa pedestrian lane sa may stoplight tumatawid. Sinusunod ng walking directions ng Planner ang mga tawirang ito.'
    },
    {
        id: 'jeep_schedule',
        source: 'Not in Calzada data (transit-routes.json has no times). Honest "not in data" answer.',
        triggers: [
            'first trip', 'last trip', 'unang biyahe', 'huling biyahe', 'unang jeep', 'huling jeep', 'last jeep',
            'first jeep', 'jeep schedule', 'schedule ng jeep', 'oras ng jeep', 'anong oras ang huling jeep',
            'what time is the last jeep', 'what time is the first jeep', '24 hours ba ang jeep', 'may jeep pa ba',
            'may biyahe pa ba', 'is there still a jeep'
        ],
        en: 'I don\'t have jeepney schedules yet, so I can\'t tell when the first or last jeep leaves or whether one is still running. Please ask at the terminal or the dispatcher. I can still tell you where to board and the estimated fare.',
        tl: 'Wala pa akong schedule ng jeep, kaya hindi ko masasabi kung anong oras ang una o huling biyahe o kung may jeep pa ngayon. Magtanong po sa terminal o sa dispatcher. Masasabi ko pa rin kung saan sasakay at ang tantiyang pamasahe.'
    },
    {
        id: 'signboard',
        source: 'transit-routes.json forward.signboard ("SM Calamba / Crossing Terminal"; others null); i18n planner.signboard',
        triggers: [
            'signboard', 'karatula', 'anong nakasulat sa jeep', 'what does the jeep say', 'sign ng jeep',
            'anong karatula', 'which jeep do i ride', 'paano ko malalaman kung anong jeep'
        ],
        en: 'When Calzada knows the signboard, the Planner shows it on the boarding step. For example, jeeps from Sta. Rosa and Los Baños going to SM read "SM Calamba / Crossing Terminal". Some signboards are not recorded yet; in that case, ask the driver or the dispatcher.',
        tl: 'Kapag alam ng Calzada ang signboard, ipinapakita ito ng Planner sa hakbang ng pagsakay. Halimbawa, "SM Calamba / Crossing Terminal" ang nakasulat sa mga jeep mula Sta. Rosa at Los Baños papuntang SM. Hindi pa naitatala ang ilang signboard; sa ganoon, magtanong sa drayber o sa dispatcher.'
    },
    {
        id: 'jeepney_routes',
        source: 'transit-routes.json routes (9)',
        triggers: [
            'anong mga ruta', 'mga ruta ng jeep', 'jeepney routes', 'jeep routes', 'what routes', 'list of routes',
            'saan pumupunta ang jeep', 'which routes do you have', 'anong ruta ang meron'
        ],
        en: 'Calzada knows these jeepney routes: Sta. Rosa (Balibago) to SM Calamba and back; Los Baños (UPLB) to SM Calamba; SM Calamba to Halang and back; Calamba to Tagaytay and Calamba to Tanauan, both passing Real; and jeeps to Real from Crossing Grand Terminal and from New Calamba Transport Terminal, and to Halang from Crossing Grand Terminal. Tell me where you\'re coming from and going, and I\'ll pick the right one.',
        tl: 'Ito ang mga rutang alam ng Calzada: Sta. Rosa (Balibago) papuntang SM Calamba at pabalik; Los Baños (UPLB) papuntang SM Calamba; SM Calamba papuntang Halang at pabalik; Calamba papuntang Tagaytay at Calamba papuntang Tanauan, na parehong dumadaan sa Real; at mga jeep papuntang Real mula Crossing Grand Terminal at New Calamba Transport Terminal, at papuntang Halang mula Crossing Grand Terminal. Sabihin mo kung saan ka manggagaling at pupunta, at pipiliin ko ang tamang sakay.'
    },
    {
        id: 'sm_drop_off',
        source: 'transit-routes.json starosa-calamba, uplb-calamba (alight at crossing-grand-terminal, sm-calamba-west)',
        triggers: [
            'saan bumababa ang jeep sa sm', 'babaan sa sm', 'drop off sa sm', 'where do jeeps drop off at sm',
            'saan ang babaan sa sm', 'where do i get off for sm', 'saan bababa para sa sm'
        ],
        en: 'Jeeps from Sta. Rosa and Los Baños pass Crossing Grand Terminal first (you can get off there), then drop passengers at SM Calamba\'s Cinema side, the west driveway by SM Cinema and Starbucks.',
        tl: 'Ang mga jeep mula Sta. Rosa at Los Baños ay dumadaan muna sa Crossing Grand Terminal (puwede kang bumaba roon), tapos nagbababa sa Cinema side ng SM Calamba, ang west driveway sa tabi ng SM Cinema at Starbucks.'
    },
    {
        id: 'terminal_tagaytay',
        source: 'transit-routes.json calamba-tagaytay (boards calamba-tagaytay-terminal, flow verified by Drei Oct 21)',
        triggers: [
            'sakayan papuntang tagaytay', 'terminal papuntang tagaytay', 'saan sasakay papuntang tagaytay',
            'terminal to tagaytay', 'jeep terminal to tagaytay', 'where to ride to tagaytay'
        ],
        en: 'Jeeps to Tagaytay load at the SM Calamba Inner Rd Terminal, by SM Cinema on SM City Calamba\'s west inner road. They go around SM, out to the National Highway at Crossing, then down Real Road past Real.',
        tl: 'Sa SM Calamba Inner Rd Terminal nagsasakay ang mga jeep papuntang Tagaytay, tabi ng SM Cinema sa west inner road ng SM City Calamba. Umiikot ito sa SM, lalabas sa National Highway sa Crossing, tapos bababa sa Real Road lampas ng Real.'
    },
    {
        id: 'terminal_tanauan',
        needsConfirm: true, // transit-routes.json: Tanauan loading point "assumed ... (to confirm)"
        source: 'transit-routes.json calamba-tanauan (boarding assumed)',
        triggers: [
            'sakayan papuntang tanauan', 'terminal papuntang tanauan', 'saan sasakay papuntang tanauan',
            'terminal to tanauan', 'where to ride to tanauan'
        ],
        en: 'Jeeps to Tanauan load at the SM Calamba Inner Rd Terminal, by SM Cinema on SM City Calamba\'s west inner road, and pass Real on the way.',
        tl: 'Sa SM Calamba Inner Rd Terminal nagsasakay ang mga jeep papuntang Tanauan, tabi ng SM Cinema sa west inner road ng SM City Calamba, at dumadaan ito sa Real.'
    },
    {
        id: 'terminal_uplb',
        needsConfirm: true, // transit-routes.json calamba-uplb: boarding "assumed" (to confirm)
        source: 'transit-routes.json calamba-uplb (boarding assumed)',
        triggers: [
            'sakayan papuntang uplb', 'terminal papuntang uplb', 'sakayan papuntang los banos',
            'terminal papuntang los banos', 'saan sasakay papuntang uplb', 'saan sasakay papuntang los banos',
            'jeep to uplb', 'jeep to los banos'
        ],
        en: 'Jeeps to Los Baños (UPLB) load at the SM City Calamba Transport Terminal, on the east side of SM City Calamba, and go through Halang on the National Highway.',
        tl: 'Sa SM City Calamba Transport Terminal nagsasakay ang mga jeep papuntang Los Baños (UPLB), sa east side ng SM City Calamba, at dumadaan ito sa Halang sa National Highway.'
    },
    {
        id: 'terminal_starosa',
        source: 'transit-routes.json starosa-calamba reverse: board at sm-calamba-west',
        triggers: [
            'sakayan papuntang sta rosa', 'terminal papuntang sta rosa', 'saan sasakay papuntang sta rosa',
            'sakayan papuntang balibago', 'jeep to sta rosa', 'where to ride to sta rosa', 'sakayan pa sta rosa'
        ],
        en: 'Jeeps back to Sta. Rosa (Balibago) load at SM Calamba\'s Cinema side, the west driveway by SM Cinema and Starbucks.',
        tl: 'Sa Cinema side ng SM Calamba nagsasakay ang mga jeep pabalik ng Sta. Rosa (Balibago), ang west driveway sa tabi ng SM Cinema at Starbucks.'
    },

    // ── Coverage ─────────────────────────────────────────────────────────────────────────────
    {
        id: 'coverage_area',
        source: 'i18n places.coverage; validation-plan decision 4 (coverage, start anywhere, destinations inside)',
        triggers: [
            'covered areas', 'coverage area', 'saan ang sakop', 'anong lugar ang sakop', 'anong barangay ang sakop',
            'which barangays', 'what areas do you cover', 'what areas are covered', 'sakop ba', 'service area',
            'outside your area', 'outside our area', 'labas ng sakop', 'saan lang pwede', 'saan lang available'
        ],
        en: 'Calzada covers Barangay Uno (Crossing / Poblacion), Real and Halang in Calamba City for now, and more barangays will be added. Your starting point can be anywhere, but destinations need to be inside these barangays.',
        tl: 'Sakop ng Calzada ngayon ang Barangay Uno (Crossing / Poblacion), Real, at Halang sa Calamba City, at madadagdagan pa ito. Puwedeng kahit saan ang simula mo, pero dapat nasa loob ng mga barangay na ito ang destinasyon.'
    },

    // ── Account and privacy ──────────────────────────────────────────────────────────────────
    {
        id: 'location_privacy',
        source: 'legal-modal.js Privacy Policy (summary, How long, retention); validation-plan decision 1',
        triggers: [
            'route history', 'is my location saved', 'naka save ba ang location', 'sine save ba ang location',
            'saved ba ang location ko', 'gps saved', 'privacy ng location', 'location privacy', 'delete route history',
            'burahin ang route history', 'delete my trips', 'burahin ang trips', 'how long do you keep',
            'gaano katagal itatago', 'do you track me'
        ],
        en: 'Calzada never saves your exact GPS location. When you plan or start a route while signed in, the starting point is kept only as a name (like "My Location" or a place name) with its barangay. Route history is deleted automatically 12 months after the route was planned, and you can delete one route or all of them anytime in Route history. Finished trips in My Trips stay until you delete them or your account.',
        tl: 'Hindi kailanman sine-save ng Calzada ang eksaktong GPS location mo. Kapag nag-plan o nag-start ka ng ruta habang naka-sign in, pangalan lang ng simula ang itinatabi (gaya ng "My Location" o pangalan ng lugar) kasama ang barangay nito. Awtomatikong binubura ang route history 12 buwan matapos i-plan ang ruta, at puwede mong burahin ang isa o lahat anumang oras sa Route history. Nananatili ang mga natapos na biyahe sa My Trips hanggang burahin mo ang mga ito o ang account mo.'
    },
    {
        id: 'data_rights',
        source: 'legal-modal.js DPO (thecalzadaph@gmail.com), rights section, RA 10173',
        triggers: [
            'delete my account', 'delete account', 'burahin ang account', 'burahin ang aking account', 'data privacy',
            'privacy policy', 'my personal data', 'data protection officer', 'dpo', 'ra 10173', 'data privacy act',
            'access my data', 'correct my data', 'npc complaint'
        ],
        en: 'To delete your account or use your data rights, email the Calzada Data Protection Officer at thecalzadaph@gmail.com from your account\'s email address, so we know the request is yours. Under the Data Privacy Act of 2012 (RA 10173), you can access, correct and delete your data, and file a complaint with the National Privacy Commission. The details are in the Privacy Policy.',
        tl: 'Para burahin ang account mo o gamitin ang iyong data rights, mag-email sa Calzada Data Protection Officer sa thecalzadaph@gmail.com gamit ang email ng account mo, para malaman naming ikaw talaga ang humihiling. Sa ilalim ng Data Privacy Act of 2012 (RA 10173), may karapatan kang i-access, itama, at burahin ang iyong data, at magreklamo sa National Privacy Commission. Nasa Privacy Policy ang mga detalye.'
    },
    {
        id: 'password_reset',
        source: 'public/js/password-reset.js resetMessage + limits; server/password-reset.js RESET_STEPS_SEC/MAX_PER_HOUR/MAX_PER_DAY; user-stats.js change password',
        triggers: [
            'forgot password', 'forgot my password', 'nakalimutan ang password', 'nakalimutan ko ang password',
            'reset password', 'reset my password', 'reset link', 'hindi dumating ang reset', 'no reset email',
            'reset email', 'change password', 'change my password', 'palitan ang password', 'baguhin ang password',
            'resend in', 'try again tomorrow'
        ],
        en: 'On the Sign in page, tap "Forgot password?" and enter your email. If it has a Calzada account with a password, a reset link is sent; check your inbox and Spam folder. The link expires in 1 hour. To keep accounts safe, you can ask again after 60 seconds, then 2 minutes, up to 3 links an hour and 5 a day. Signed in already? Change it in Account Settings: enter your current password first, then the new one. If you sign in with Google, your password is managed in your Google account.',
        tl: 'Sa Sign in page, pindutin ang "Forgot password?" at ilagay ang email mo. Kung may Calzada account na may password ang email, may ipapadalang reset link; tingnan ang inbox at Spam folder. Mag-e-expire ang link sa loob ng 1 oras. Para sa kaligtasan ng account, puwedeng humiling ulit pagkalipas ng 60 segundo, tapos 2 minuto, hanggang 3 link bawat oras at 5 bawat araw. Naka-sign in ka na? Palitan ito sa Account Settings: ilagay muna ang kasalukuyang password, tapos ang bago. Kung Google ang gamit mo sa pag-sign in, sa Google account mo pinapalitan ang password.'
    },
    {
        id: 'password_rules',
        source: 'validators.js validatePassword; Firebase password policy (8–64, lower, upper, digit, special, no spaces)',
        triggers: [
            'password requirements', 'password rules', 'valid password', 'password must', 'ano ang dapat sa password',
            'bakit ayaw ng password', 'password not accepted', 'password too weak', 'mahina ang password'
        ],
        en: 'A Calzada password needs 8 to 64 characters, with a lowercase letter, an uppercase letter, a number and a special character, and no spaces. The checklist under the field shows which rules are met.',
        tl: 'Kailangan ng Calzada password ng 8 hanggang 64 na character, may maliit na titik, malaking titik, numero, at special character, at walang space. Makikita sa checklist sa ilalim ng field kung alin ang pasado na.'
    },
    {
        id: 'sign_in_options',
        source: 'login.html (email + password, Google); user-stats.js Google-only accounts',
        triggers: [
            'sign in with google', 'login with google', 'log in with google', 'google account', 'how to sign up',
            'paano mag sign up', 'paano gumawa ng account', 'create an account', 'gumawa ng account', 'paano mag register'
        ],
        en: 'You can sign in with Google or create an account with your name, email and a password on the Sign in page (calzadaph.com/login). You\'ll be asked to accept the Terms of Service and Privacy Policy.',
        tl: 'Puwede kang mag-sign in gamit ang Google o gumawa ng account gamit ang pangalan, email, at password sa Sign in page (calzadaph.com/login). Hihilingin sa iyong tanggapin ang Terms of Service at Privacy Policy.'
    },
    {
        id: 'saved_places',
        source: 'i18n nav.user.* (Saved Places, My Visits, My Trips, My Badges)',
        triggers: [
            'saved places', 'save a place', 'paano mag save ng lugar', 'i save ang lugar', 'my visits', 'my badges',
            'paano makakuha ng badge', 'how to get badges', 'bookmark a place'
        ],
        en: 'When you\'re signed in, you can save places, and your Saved Places, My Visits, My Trips and My Badges are in your profile menu.',
        tl: 'Kapag naka-sign in ka, puwede kang mag-save ng mga lugar, at nasa profile menu mo ang Saved Places, My Visits, My Trips, at My Badges.'
    },
    {
        id: 'reviews',
        source: 'validation-plan Phase 4 (tap-to-rate, rating on arrival ticket)',
        triggers: [
            'rate a place', 'review a place', 'leave a review', 'mag review', 'magbigay ng rating', 'paano mag rate',
            'how to rate', 'write a review'
        ],
        en: 'Signed in, you can rate a place on its page. After you arrive using Start Journey, the arrival ticket also asks you to rate the place.',
        tl: 'Kapag naka-sign in, puwede mong i-rate ang isang lugar sa page nito. Pagdating mo gamit ang Start Journey, hihingan ka rin ng rating sa arrival ticket.'
    },
    {
        id: 'feedback',
        source: 'i18n feedback.* (categories, sign-in gate, Routie prompts); footer "Submit a Route"',
        triggers: [
            'report a bug', 'send feedback', 'give feedback', 'magbigay ng feedback', 'mali ang ruta', 'wrong route',
            'wrong fare', 'mali ang pamasahe', 'missing place', 'walang lugar sa map', 'wala sa map',
            'report a problem', 'mag report', 'suggest a feature', 'submit a route', 'suggest a route',
            'add a place', 'add my place', 'magdagdag ng lugar'
        ],
        en: 'Please tell us on the Feedback page (calzadaph.com/feedback): choose Bug Report, Suggestion or General and describe what happened, like a wrong fare or route or a missing place. You need to be signed in so we can follow up. For a jeepney route we don\'t have yet, use Submit a Route in the site footer.',
        tl: 'Sabihin po sa amin sa Feedback page (calzadaph.com/feedback): piliin ang Bug Report, Suggestion, o General at ikuwento ang nangyari, gaya ng maling pamasahe o ruta o kulang na lugar. Kailangang naka-sign in ka para ma-follow up namin. Para sa rutang wala pa sa amin, gamitin ang Submit a Route sa footer ng site.'
    },
    {
        id: 'contact',
        source: 'validation-plan (thecalzada@gmail.com admin/sender); legal-modal DPO',
        triggers: [
            'contact calzada', 'contact you', 'email ng calzada', 'how to contact', 'paano kayo makokontak',
            'paano makipag ugnayan', 'contact us', 'calzada email', 'contact number'
        ],
        en: 'You can email Calzada at thecalzada@gmail.com. For privacy, account deletion or payment questions, write to the Data Protection Officer at thecalzadaph@gmail.com. To report a bug or a wrong route, the Feedback page (calzadaph.com/feedback) is fastest.',
        tl: 'Puwede kang mag-email sa Calzada sa thecalzada@gmail.com. Para sa privacy, pagbura ng account, o tanong tungkol sa bayad, sumulat sa Data Protection Officer sa thecalzadaph@gmail.com. Para mag-report ng bug o maling ruta, pinakamabilis ang Feedback page (calzadaph.com/feedback).'
    },
    {
        id: 'language',
        source: 'i18n.js (en / tl); Routie detectTagalog',
        triggers: [
            'speak tagalog', 'marunong ka ba mag tagalog', 'marunong ka ba mag english', 'can you speak english',
            'change language', 'palitan ang wika', 'switch to tagalog', 'switch to english', 'in english please',
            'tagalog please', 'english please'
        ],
        en: 'Yes. Routie and Calzada work in English and Tagalog, and you can switch the site language anytime. Just write in the language you like.',
        tl: 'Oo. Gumagana si Routie at ang Calzada sa English at Tagalog, at puwede mong palitan ang wika ng site anumang oras. Sumulat ka lang sa wikang gusto mo.'
    },
    {
        id: 'who_made',
        source: 'i18n about_page.team.capstone',
        triggers: [
            'who made calzada', 'who created calzada', 'sino gumawa ng calzada', 'sino ang gumawa', 'who built this',
            'who are the developers', 'capstone project'
        ],
        en: 'Calzada is a capstone project by BSIT students of STI College Calamba. You can read more on the About Us page.',
        tl: 'Ang Calzada ay isang capstone project ng mga BSIT student ng STI College Calamba. Mababasa ang higit pa sa About Us page.'
    },
    {
        id: 'view_360',
        source: 'plans-config.js has360; business-model (360 shoot by the team)',
        triggers: [
            '360 view', '360 photo', 'ano ang 360', 'what is 360', '360 shoot', 'look around before i go', 'virtual tour'
        ],
        en: 'Some places have a 360 view, so you can look around before you go. Businesses on the Listed + 360 and Featured plans get a 360 shoot by the Calzada team.',
        tl: 'May 360 view ang ilang lugar para makita mo ang paligid bago pumunta. Ang mga negosyo sa Listed + 360 at Featured plan ay may 360 shoot mula sa Calzada team.'
    },

    // ── Business owners ──────────────────────────────────────────────────────────────────────
    {
        id: 'business_plans',
        source: 'public/js/plans-config.js (prices, posts per month, featuredDays, pinnedPosts, add-ons); business-model-and-plans.md (one-time, GCash, after approval)',
        triggers: [
            'business plans', 'listing plans', 'magkano ang listing', 'magkano magpalista', 'how much to list',
            'how much does it cost to list', 'price ng plan', 'listing fee', 'bayad sa pag lista', 'plans and pricing',
            'featured plan', 'listed plan', 'listed 360', 'monthly fee', 'may monthly ba', 'add ons', 'pin a post'
        ],
        en: 'Listing is a one-time payment with no monthly charges, paid by GCash only after your registration is approved. Listed is ₱59: a pin on the map and Places, a profile, Plan route with fare, and 4 updates a month. Listed + 360 is ₱199: everything in Listed plus a 360 shoot by the team and a 360 view, with 8 updates a month. Featured is ₱299: everything in Listed + 360 plus 14 days in "New on Calzada", 1 pinned post, unlimited updates, and your application reviewed first. Add-ons: an extra 360 shoot is ₱99 and pinning a post for 7 days is ₱29. To upgrade, you pay the difference. See calzadaph.com/plans.',
        tl: 'Isang beses lang ang bayad sa listing at walang buwanang singil, at sa GCash ito binabayaran pagkatapos ma-approve ang rehistrasyon. ₱59 ang Listed: pin sa mapa at Places, profile, Plan route na may pamasahe, at 4 na update bawat buwan. ₱199 ang Listed + 360: lahat ng nasa Listed, dagdag ang 360 shoot ng team at 360 view, at 8 update bawat buwan. ₱299 ang Featured: lahat ng nasa Listed + 360, dagdag ang 14 na araw sa "New on Calzada", 1 naka-pin na post, walang limitasyong update, at nauunang mare-review ang application mo. Mga add-on: ₱99 ang dagdag na 360 shoot at ₱29 ang pag-pin ng post nang 7 araw. Para mag-upgrade, babayaran mo lang ang diperensya. Tingnan ang calzadaph.com/plans.'
    },
    {
        id: 'business_payment',
        source: 'business-model-and-plans.md owner flow; plans-config.js CALZADA_PAYMENT (gcash, within 1–2 days)',
        triggers: [
            'how to pay', 'paano magbayad', 'gcash', 'payment method', 'reference number', 'upload receipt',
            'mag upload ng resibo', 'bayad sa gcash', 'pay with card', 'bank transfer', 'payment not verified',
            'hindi pa verified ang bayad'
        ],
        en: 'You pay only after your registration is approved. On your My Business page, scan Calzada\'s GCash QR, then upload the receipt screenshot and the reference number. The team checks the payment within 1–2 days, and each reference number can be used only once. GCash is the only payment method. If the payment doesn\'t match, you can upload the receipt again. For payment problems, email thecalzadaph@gmail.com with your reference number.',
        tl: 'Magbabayad ka lang kapag approved na ang rehistrasyon mo. Sa My Business page, i-scan ang GCash QR ng Calzada, tapos i-upload ang screenshot ng resibo at ang reference number. Sinusuri ng team ang bayad sa loob ng 1–2 araw, at isang beses lang magagamit ang bawat reference number. GCash lang ang paraan ng pagbayad. Kung hindi tugma ang bayad, puwede mong i-upload ulit ang resibo. Para sa problema sa bayad, mag-email sa thecalzadaph@gmail.com kasama ang reference number.'
    },
    {
        id: 'business_status',
        source: 'business-model-and-plans.md statuses (pending, needs_changes, rejected, awaiting_payment, payment_review, approved); email at every status',
        triggers: [
            'needs changes', 'awaiting payment', 'payment review', 'status ng business', 'business status',
            'status ng application', 'application status', 'ano ang ibig sabihin ng pending', 'what does pending mean',
            'kailan lalabas ang business ko', 'when will my business appear'
        ],
        en: 'After you register, your business is Pending while the team reviews it. It can come back as Needs changes (fix the details and resubmit), Rejected (you never pay), or Awaiting payment. After you upload your GCash receipt it is in Payment review, and once the payment is verified it is Approved and live on the map and Places, where you can post in Updates. You get an email at every step, and the status is always on your My Business page.',
        tl: 'Pagkatapos magrehistro, Pending ang negosyo mo habang nire-review ng team. Puwede itong bumalik bilang Needs changes (ayusin ang detalye at i-submit ulit), Rejected (hindi ka magbabayad), o Awaiting payment. Pagka-upload ng resibo sa GCash, nasa Payment review ito, at kapag na-verify ang bayad, Approved na ito at makikita sa mapa at Places, at puwede ka nang mag-post sa Updates. May email ka sa bawat hakbang, at laging nasa My Business page ang status.'
    }
];

// Replacement triggers for existing FAQS in routie-knowledge.js. Each replaces that FAQ's whole
// triggers array. Reason: the old lists had single common words ("mobile", "purpose", "libre ba",
// "mailista") that matched unrelated questions (see routie-eval.json cases tagged "regression").
const FAQ_TRIGGER_FIXES = {
    mobile_access: [
        'can i access calzada on mobile', 'calzada on mobile', 'use calzada on my phone', 'on my phone',
        'magagamit ba sa cellphone', 'gamitin sa cellphone', 'gamitin sa phone', 'sa cellphone ba',
        'may app ba', 'is there an app', 'mobile app', 'android app', 'ios app', 'download the app', 'i download ang app'
    ],
    main_goal: [
        'main goal', 'goal of calzada', 'purpose of calzada', 'layunin ng calzada', 'bakit ginawa ang calzada',
        'why was calzada made', 'what is calzada for'
    ],
    is_free: [
        'free to use', 'is calzada free', 'is it free to use', 'libre ba gamitin', 'libre ba ang calzada',
        'libre ba gamitin ang calzada', 'may bayad ba ang calzada', 'may bayad ba gamitin', 'do i need to pay to use'
    ],
    business_register: [
        'list my business', 'register my business', 'register business', 'register a business',
        'ilista ang negosyo', 'mailista ang negosyo', 'maililista ang negosyo', 'maglista ng negosyo',
        'magrehistro ng negosyo', 'rehistro ng negosyo', 'magparehistro ng negosyo', 'how to register my business',
        'how do i list my business', 'register your business', 'ilista ang aking negosyo', 'mailista ang aking negosyo',
        'maililista ang aking negosyo', 'maililista ko', 'mailista ko', 'ilista ko', 'negosyo sa calzada',
        'business sa calzada', 'my business on calzada', 'add my business'
    ],
    transport_modes: [
        'transport options', 'modes of transport', 'transport options does calzada support', 'anong sasakyan ang meron',
        'mga transportasyon', 'anong transportasyon'
    ],
    suggested_terminals: [
        'suggested terminals', 'suggested terminal', 'terminal choices', 'mga terminal sa calamba',
        'saan ang mga terminal', 'terminals in calamba', 'anong mga terminal', 'ano ang mga terminal',
        'terminal sa calamba', 'list of terminals', 'where are the terminals'
    ]
};

module.exports = { FAQS_EXTRA, FAQ_TRIGGER_FIXES };
