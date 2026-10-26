# Dark Forest v0.2 — 2D top-down pixel-art sandbox

Open `index.html` via any static server (`python3 -m http.server 8090`) and visit http://localhost:8090.
Pure Canvas 2D, no dependencies (three.js removed).

## World
Seeded 512×512 island with ocean, beaches and 8 regions: Meadows, Deep Woods, Reedmarsh, Rocky Highlands & Caves,
Lakeside (dock, lily pads, swim-only islet), Sandy Coast (dunes), Old Ruins, and the Haunted Heart (Stefan's gothic mansion,
moat, graveyard, pumpkins, iron fence). Art blends from cosy village style at the edges into purple corruption at the centre.
Region names on the map (🗺 Regions toggle) and in the inspector.

## Simulation
Thronglets forage, farm (crop stages), build thatch huts that upgrade to stone, palisades → stone walls with gates; tribes,
reputation, gossip, exile at dusk. Vampires (Stefan + turned victims) hunt at night, flank, pin gates, fly in bat form.
**Hiding:** exiles/stragglers caught out at night seek caves, hollow logs, thick bramble, reed beds, ruined nooks, tree hollows
or the lake islet (swim). Each spot has concealment + capacity; vampires search where they last saw prey; detection depends on
distance, concealment and noise (fear, crowding). Exiles remember and share spots and band together.

## Controls
Desktop: drag pan, wheel zoom, WASD/arrows, Q/E zoom, click to inspect/follow. Mobile: one-finger pan, pinch zoom, two-finger pan,
tap select/place. Every panel collapses; 👁 hides all; ⛶ fullscreen + landscape lock; rotate overlay in portrait.
God tools: spawn, drop berries/nuts/reeds/stone/wood, reset with seed. Speed: pause, 1×, 4×, 16×.

## Tests
`cd test && node simtest.mjs` (headless sim), `node run.mjs` (Playwright desktop + mobile 844×390, screenshots to `shots/`).

## v0.2 additions
- Thin, edge-joined walls: palisade about 1/3 tile, stone with crenellations, posts at corners, gates swing open (visual only).
- 83 Kingsway: Stefan's colonial house with columns, balcony, amber windows, red door with the number 83, "Kingsway" signs,
  "Goblin Yates" yard sign, topiary, lavender, a wet cobble path and an iron lamp. Tap it for the inspector portrait.
- Storm nights (about 40% from night 2): clouds, rain and lightning concentrated around the house. Rain masks noise
  (detection ×0.55), so hiding is easier. Storms are logged.
- More expressions (happy, sad, blink, fear), arm swing, tails, chimney smoke.

## v0.4 — original character art
Every Thronglet is drawn with the original Ian sprite and every vampire (incl. the Turned) with the original Stefan sprite. There are no variations: you tell individuals apart by name labels and the inspector, which shows the original portraits. Animation is procedural (hop, squash/stretch, flip, ear wobble, cape sway, leg swing, sleep tilt, fear shake, carried item, bubbles), with red eye glow at night. Shots 18–21 come from `node test/creatures.mjs`.

## v0.5 — sheltering at night
At dusk (around 16:00 on the in-game clock), each tribe calls its people home. Members eat from the tribe stores, then go into their assigned hut: timber huts hold 3 and stone huts hold 4. Anyone inside a hut isn't drawn; the hut shows lit windows and a "zZ n" occupant tag, and clicking a hut opens an inspector with who's inside and the door's HP. Indoors is completely safe: **vampires never enter any building except their own mansion at 83 Kingsway**, so there are no hut break-ins. Walls still work as before, meaning vampires can breach them or pin an open gate. Exiles and wanderers still hide. A few brave or greedy members stay out to finish a job. Tribes build huts until there's a bed for everyone, and births are capped at the number of beds. Hunger now rises more slowly and drops by half while sleeping, and members eat their fill from the tribe stores before bed. Per-night stats: `node test/nights.mjs 42 7`; browser check plus shots 26–29: `node test/huts.mjs`.


## v0.5.1 — the rules doc: no hut breaches, stalking, exile adoption
- **Vampires hunt only outside.** When every door is shut, the pack circles the village edge (`state: stalking`) and waits for stragglers, late workers, exiles and outcasts. Members caught near a vampire after dusk run for their own door. Screenshot: `shots/29_vampire_stalking_outside.png`.
- **Exiles must be adopted.** A Thronglet who's been cast out petitions the other tribes one at a time, by day. They can never go back to the tribe that cast them out. Each tribe weighs its opinion of the exile, the exile's reputation and why they were cast out (hoarders and attackers are least welcome), plus its spare beds and food stores. If a tribe accepts, the exile becomes a full member with a bed and shelters indoors. Every request, acceptance and refusal is logged. Anyone turned away by every tribe becomes a true outcast who hides at night, and only rarely founds a new tribe later.

## v0.6 — Penguin minions (BlackCardU)
*"Penguins are Vampire minions who go around and try to find prey for vampires. During the day they try to convince people to join BlackCardU and live in the mansion. They become penguins if converted."* — Kyler. *"There are 10 bedrooms in the Mansion aside from the Vampires."*
- **Sprite:** Kyler's pixel penguin holding the BlackCard University book (`ref/penguin-src.png`), trimmed into `assets/penguin*.png` at LOD sizes 24, 48, 96 and 192. Every penguin uses this exact sprite. It's drawn at about Thronglet height, grounded with a shadow, and has a waddle tilt and step bounce. The single-file build inlines it through `window.__DF_IMG`.
- **Mansion:** three penguins start at 83 Kingsway. There are **10 penguin bedrooms**, separate from the vampires' rooms. When all 10 are taken, recruiting pauses and the story logs "Every bedroom at 83 Kingsway is full", then resumes once a bed frees up. The top bar shows `🐧 n/10` and the mansion inspector shows bedrooms used.
- **Night (scouts):** penguins waddle around the villages looking for anyone outside, such as stragglers, exiles, hiders or people at the fire. A well-hidden Thronglet often goes unseen, depending on the hiding spot's concealment and the storm. When a penguin spots someone, the nearest free vampire is sent after them, e.g. "A penguin, Pip, spotted exile Weet in the Meadows and flapped for Stefan." Penguins never enter huts, never kill, and are never attacked by vampires.
- **Day (recruiters):** a penguin walks up to a Thronglet and pitches BlackCardU, shown with a book or talk bubble. Exiles, refused outcasts, hungry, disliked or frightened Thronglets are much easier to win over. Well-fed, well-respected members mostly refuse, and brave members may shoo the penguin away. A convert leaves their tribe, walks to 83 Kingsway and becomes a penguin (same sprite), who then works as a minion too. **Caps:** each penguin can convert at most one Thronglet a day, there are at most two conversions a day overall, the total stays at or below max(3, 20% of the population), and there are never more than 10 bedrooms.
- **Inspector:** shows name, state (scouting, signalling, recruiting, pitching, returning, resting), conversions, prey spotted and bedroom occupancy. God tools have a 🐧 Penguin spawn button, which respects the bedroom cap.
- **Tests:** `node test/peng.mjs <seed> <days> [v]` for per-day stats, and `node test/penguins.mjs` for the Playwright desktop and mobile run plus shots 30–32.

## v0.7: Ian Tumnus, the Penguin Manager
*"New character who manages the penguins. The Ian Tumnus."* and *"He goes around parading the mansion grounds and also checking penguins are doing their Job and snitching to the vampires if caught."* (Kyler)
- **Sprite:** Kyler's faun art (`ref/tumnus-src.png`), with the background flood-filled from the edges, cropped, downscaled with an unsharp pass, and reduced to a 48-colour palette with hard alpha. That gives a crisp 96px pixel master, and `assets/tumnus*.png` hold its 24, 48, 96, 192 and 288px versions. He's unique, about Stefan's height, and gets a shadow plus a proud strut with a bob and sway. The single-file build inlines him.
- **Role:** he lives in his own room at 83 Kingsway, not one of the 10 penguin bedrooms. He isn't a vampire, the sun doesn't hurt him, he never enters huts, and neither Thronglets nor vampires attack him.
- **Orders:** every morning he hands out recruiting assignments, putting tribes with hungry, disliked, frightened or nearby exiled members first ("Ian Tumnus handed out the day's assignments: Pip to Fernreach, …"). Every night he assigns scouting regions. When all 10 bedrooms are full, he switches the penguins to scouting only. Penguins within 8 tiles of him recruit and spot a little better, and all the caps still apply.
- **Patrol:** his default is parading an 8-point loop around the 83 Kingsway grounds. After every two loops he walks out to inspect a penguin in the field. He personally pitches BlackCardU, with his parcel, to exiles and outcasts; his converts become penguins too.
- **Slacking and snitching:** penguins sometimes slack off. They nap (zZ, lying down), belly-slide (sprite on its side) or fish near water (fish bubble). If Ian Tumnus catches one, he snitches to Stefan or another vampire, and a "!" appears over both the penguin and the vampire. The penguin is never killed. Instead it's either summoned to the mansion for a scolding and loses its next outing, or ordered to do double scouting that night. Either way it won't slack again for 3 days. At night he also snitches on Thronglets he spots outside, and a vampire is sent after them.
- **UI:** clicking him shows his role, what he's doing, current orders, penguins managed, his conversions, penguins caught slacking and Thronglets snitched. The god-tools button 🧣 Tumnus follows him. Penguin inspectors show their orders and any slacking or punishment.
- **Tests:** `node test/peng.mjs`, `node test/penguins.mjs` (shots 30–34) and `node test/sunrise.mjs` (how often Stefan burns at sunrise).

## v0.8 — Tumnus fires penguins, vampires grow, god-summoned vampires
- **Firing:** every 4th day at the morning assignment Ian Tumnus fires the worst penguin (most times caught slacking, else the longest-serving). There's a log line and an angry bubble, and the penguin walks off the grounds. It then becomes an ordinary Thronglet and an exile ("a fired penguin"), who must be adopted by a tribe or hide. A fired penguin can't be re-recruited for 4 days. Tumnus never fires when 3 or fewer penguins remain, and logs that he kept everyone on.
- **Vampires scale with the days:**
  - Stronger: up to +70% HP and bites up to 36 damage by about day 25.
  - More of them: up to 12, with 2 arrivals per night from day 10.
  - Bigger hunts: up to 4 packs, and nights run longer.
  - Walls go faster: walls are breached sooner, and from day 6 vampires batter gates.
  - Huts are untouched, and vampires still never enter any building except 83 Kingsway.
- **Fighting back:** Thronglets do less damage. A beaten vampire is usually *driven off* rather than destroyed (12% destroy chance, falling to 6% later).
- **No extinction:** the vampire count, bite strength and turning chance ease off when the population falls below 34, 24 and 14.
- **🧛 Vampire god tool:** summons a vampire with Stefan's look. It lives in the vampire rooms at 83 Kingsway, which are separate from the 10 penguin bedrooms. There is a cap of 12.
- **Tests:** `node test/long.mjs <seed> <days>` runs the 30+ day balance check, and `node test/fire.mjs` takes shots 35 and 36.

## v0.9: mansion's shadow, deadlier vampires, fight-back, guaranteed recruiting
- **The mansion's shadow:** vampires are immune to the sun within 12 tiles of 83 Kingsway's centre. That covers the yard and courtyard only, not the wider grounds. By day the zone shows as a dusky purple ring.
  - The inspector shows "🛡️ Safe in the mansion's shadow" inside the ring and "☀️ Burning in the sun!" outside it.
  - A vampire caught out at dawn rushes for the zone; the log says so, and again when it arrives.
  - By day vampires loiter inside the zone. They still never enter huts or any building except the mansion.
- **Deadlier vampires:**
  - They leave right at dusk (tod 0.72) and hunt later into the morning.
  - Bites do 30, rising to 48 damage.
  - They chase and fly faster.
  - They can hear hidden Thronglets from 8 to 12 tiles away. When one is flushed out, nearby vampires join the chase and flank it.
  - Walls are torn faster, and gates are battered from day 3.
- **Thronglets fight back:** a brave Thronglet with an ally nearby, or one whose tribemate is being bitten, may stand and fight. They usually lose. Sometimes a group drives the vampire off, and very rarely one is destroyed.
- **Penguins:**
  - At least one recruit every 3 days while a bed is free. A due recruit always lands; there is a backstop at tod 0.6.
  - Firing happens every 4 days, only when there are more than 3 penguins.
  - A fired penguin becomes a tribeless exile outside the walls, and so is prey. It can't be re-recruited for 4 days.
  - Beds count Thronglets already walking to the mansion, so the colony never goes past 10.
- **No extinction:** the ease-off below 34, 24 and 14 Thronglets is kept.

## v0.10 — bats, hideouts, no fight-back
- **No fight-back.** Thronglets only flee or hide. They never fight back or chase vampires off as a group.
- **Stefan is immortal.** Nothing kills him, the sun included. At dawn he just hurries home.
- **Bat form at dawn.** Shortly before sunrise, each vampire turns into a bat in a puff of smoke. It flies straight home at high speed, over terrain and walls, and changes back when it lands.
  - It goes to 83 Kingsway if it can get there before sunrise. Otherwise it goes to the nearest free forest hideout.
  - Bats never hunt or bite.
  - The inspector shows "🦇 Bat form, flying home".
  - The bat is drawn in code (`bigBat()` in art.js). To swap in an image, set `BAT_SPRITE` in render2d.js.
- **Hideouts.** 31 hideouts are seeded across the map: caves, hollow logs and crypts, 2 vampires each.
  - They are safe from the sun. Thronglets don't use them, and they are not buildings.
  - A vampire rests inside by day (the inspector shows "Resting in …") and slips out at dusk.
- **Better catching.**
  - Vampires chase faster than Thronglets can flee, lunge at close range, and hop over walls or trees that block them.
  - They break off distant plans when exposed prey is close.
  - Any Thronglet on the 83 Kingsway grounds is sensed by the whole coven.
  - A Thronglet that is being bitten can't slip into a hiding spot.
- **Coven appetite.** The coven has a nightly kill budget that shrinks as the Thronglets thin out, down to zero below 28. This keeps the population healthy.
- The single-file and itch build no longer registers a service worker.

## v0.11 — painted bat, door landings, trade, village names, guards, swarms, raid rotation (published, cache dark-forest-v8)
- **Bat sprite**: Kyler's two-frame painted sheet (`assets/bat-flap.png`, wings up / wings down), drawn nearest-neighbour; inlined in the single-file build.
- **Door landings**: bats fly to the door of 83 Kingsway and materialize within 1 tile of it before going inside; hideout-bound bats land at the hideout entrance. 0 sun deaths.
- **Trade**: villages swap surplus for shortages using 1–2 trader Thronglets. Traders travel by day only and cut the trip short at dusk. A trader caught by a vampire drops the goods. Exiles don't trade.
- **Village names**: deterministic per seed. A clickable mini-map (bottom right) shows the villages, 83 Kingsway, vampires, traders and the camera view; names also appear over villages when zoomed in. Every village message names its village.
- **Village guards**: 1 guard per village (2 once it has 8+ members), standing watch by day and at dusk and sheltering at night. Each vampire is a separate roll: the guard wins 40% of the time and the vampire is wounded and bats back inside 83 Kingsway for the rest of the night. Vampires are never killed, and Stefan never fights guards. A guard caught is replaced.
- **Swarms**: up to 4 vampires converge on one target. A vampire squaring up to a guard calls its pack, and the guard must win every roll.
- **Clockwise raid rotation**: villages are sorted by bearing around 83 Kingsway. Each night the coven's main pack (all but ~1 in 4 opportunists) flies out in bat form to the next village clockwise and materializes at its edge. Far-flung vampires head home early: to the door if it's in reach, otherwise to the nearest forest hideout. Extra hideouts are added near raid sites if needed.
- Tests: `test/raid.mjs`, `test/defender.mjs` (with the name check), `test/trade.mjs`, `test/dawn.mjs`, `test/v011shots.mjs`.

## v0.11.1 (local, awaiting approval; cache dark-forest-v9, not pushed)
- **Mini-map labels**: bigger font on dark rounded pills, labels nudged apart so they never overlap (with a leader line if moved far), kept inside the frame. The mini-map is now 260 px (150 px on short screens).
- **No village wipeouts ("lying low")**: a village down to 5 or fewer members lies low. The raid rotation passes it by, and its people within 30 tiles of home aren't hunted (the last 2 aren't hunted anywhere). Each dawn the biggest village (12+) sends 2 migrants to help it rebuild. It stops lying low at 8. Births now need two different parents (fixes "child of Nyb & Nyb").
- **Population floor**: the nightly kill budget is 0 below 28 Thronglets for the first 4 days and below 41 on days 5–10 and below 39 after that, plus up to 3 births per village per dawn while the island is under 46, so the island holds ~40+.
- **a/an**: every feed line goes through `fixArticles()` ("an Emberfall door", "An Oakhollow guard").
- Test: `test/villages.mjs` (no wipeouts, min village size, min pop after day 7; seeds 7, 42, 123, 1, 99).
