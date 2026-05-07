#!/bin/bash
# Generate symbolic images for all 17 Cathedral Deck cards
# Uses Higgsfield nano_banana_2, 16:9 aspect
# Each prompt: symbolic not literal, dark Cathedral aesthetic (#09090f), amber accents

OUT_DIR="$HOME/nanoclaw/reed-lab/slides/card-images"
mkdir -p "$OUT_DIR"

echo "Generating 17 Cathedral Deck card images..."
echo ""

# #001 The Cathedral
higgsfield gen create nano_banana_2 \
  --prompt "A vast cathedral interior rendered in deep navy-black (#09090f), viewed from above. Geometric amber light streams through impossibly tall windows, illuminating a central altar where dozens of thin golden threads connect to glowing nodes arranged in a constellation pattern on the walls. The threads form a living network. Architectural stone arches frame the space. Cinematic 16:9, dramatic volumetric lighting, no text, no people." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/001-the-cathedral.png" 2>&1 | tail -1 &

# #002 The Vault
higgsfield gen create nano_banana_2 \
  --prompt "An ancient library vault stretching into infinite darkness. Thousands of floating amber crystal shards arranged in clusters, each shard containing a faint glow of knowledge. Some clusters are bright and dense (settled domains), others sparse and dim (frontier zones). Deep black background with purple undertones. Stone archways frame tiers of crystalline shelves. Cinematic 16:9, ethereal lighting, no text." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/002-the-vault.png" 2>&1 | tail -1 &

# #003 The Experiment Lab
higgsfield gen create nano_banana_2 \
  --prompt "Seven glass vessels arranged in a circle on a dark stone table, each containing a different colored liquid light — amber, red, blue, green, purple, pink, silver. Thin golden threads connect the vessels through the air, forming a web. Above the circle, a single eye-like lens watches. Deep black background (#09090f). Alchemist's laboratory aesthetic meets modern observatory. Cinematic 16:9, dramatic lighting from below." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/003-experiment-lab.png" 2>&1 | tail -1 &

# #004 The Roundtable
higgsfield gen create nano_banana_2 \
  --prompt "Eight stone chairs arranged in a circle around a dark obsidian table. Each chair has a different geometric symbol carved into its back, glowing in a different color — amber, blue, green, red, silver, purple, pink, gold. The table surface shows a holographic projection of colliding waveforms. Deep cathedral darkness with dramatic amber side-lighting. Empty chairs suggesting presence without figures. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/004-roundtable.png" 2>&1 | tail -1 &

# #005 The Meta-Watcher
higgsfield gen create nano_banana_2 \
  --prompt "A single enormous eye composed of concentric geometric rings, floating in cathedral darkness. The iris is made of overlapping data streams in amber, blue, and green — representing different domains being observed simultaneously. Below the eye, three separate landscapes are visible through portals: a trading floor, a boxing ring, an art studio. The eye watches all three. Deep black, dramatic amber light. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/005-meta-watcher.png" 2>&1 | tail -1 &

# #006 Predictive Intelligence
higgsfield gen create nano_banana_2 \
  --prompt "Four translucent layers floating one above another in dark space, each a different shade of amber-to-purple. Bottom layer: dense network of interconnected nodes (knowledge graph). Second layer: flowing streams connecting gaps. Third layer: glowing map with terrain features. Top layer: small seeds of light drifting upward into darkness above. Architectural stone frame. Cinematic 16:9, volumetric depth." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/006-predictive.png" 2>&1 | tail -1 &

# #007 The Trading Desk
higgsfield gen create nano_banana_2 \
  --prompt "Eleven candles of different heights arranged on a dark stone altar, each burning with a different colored flame — representing competing trading strategies. Some flames lean toward each other (convergence), others push apart (divergence). A bull and bear shadow cast on opposing cathedral walls. Amber price charts etched into the stone floor like ancient inscriptions. Deep black, dramatic fire lighting. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/007-trading-desk.png" 2>&1 | tail -1 &

# #008 The Boxing Lab
higgsfield gen create nano_banana_2 \
  --prompt "A boxing ring at the center of a dark cathedral nave. Six ghostly figures in different fighting stances surround the ring — each a different style made visible: angular footwork patterns traced in amber light on the floor, circular motion trails in blue, powerful straight lines in red. The ring ropes glow faintly. Punching bag hanging from a gothic arch. Deep black with warm amber accent lighting. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/008-boxing-lab.png" 2>&1 | tail -1 &

# #009 The Creative Lab
higgsfield gen create nano_banana_2 \
  --prompt "A painter's palette floating in dark cathedral space, but instead of paint colors, each well contains a miniature world — one noir with dramatic shadows, one neon-lit cyberpunk, one manga ink, one vintage poster. A golden compass needle points between them, deciding which world to enter next. Amber light catches the edges. Deep black background. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/009-creative-lab.png" 2>&1 | tail -1 &

# #010 Reed — Visual Director
higgsfield gen create nano_banana_2 \
  --prompt "A director's viewfinder floating in dark space, looking through it reveals a grid of ten different visual styles applied to the same boxing gym scene — each square a different aesthetic treatment. The viewfinder frame is golden with subtle gear mechanisms. Camera lens elements catch amber light. Film strip curling around the edges. Deep cathedral black. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/010-reed.png" 2>&1 | tail -1 &

# #011 The Cartographer
higgsfield gen create nano_banana_2 \
  --prompt "An ancient cartographer's desk seen from above. A partially drawn map on dark parchment shows settled territories in amber ink and unexplored regions dissolving into darkness at the edges. A compass rose in the center glows blue. Thin lines connect named territories. The frontier — the edge where ink meets darkness — glows faintly with possibility. Quill and ink pot. Deep black, warm candlelight. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/011-cartographer.png" 2>&1 | tail -1 &

# #012 Cymatics / Schumann
higgsfield gen create nano_banana_2 \
  --prompt "A circular metal plate vibrating at frequency, showing a perfect cymatic pattern — geometric sand formations at a resonant node. The pattern resembles both a flower and a circuit diagram. Surrounding the plate, concentric waves radiate outward at 7.83 Hz frequency. The waves interact with price chart lines and heartbeat rhythms visible in the background. Purple and amber tones. Deep dark space. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/012-cymatics.png" 2>&1 | tail -1 &

# #013 The Morning Briefing
higgsfield gen create nano_banana_2 \
  --prompt "A golden microphone floating in dark cathedral space, surrounded by concentric sound waves rendered as thin amber rings expanding outward. The waves carry tiny data points — chart fragments, project icons, clock faces — embedded in the sound. Dawn light entering from the right side through a gothic window. The transition from night intelligence to morning voice. Deep black to warm amber gradient. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/013-morning-briefing.png" 2>&1 | tail -1 &

# #014 The Muse
higgsfield gen create nano_banana_2 \
  --prompt "A solitary lantern floating through a vast dark library at 3am. The lantern casts amber light that reveals unexpected connections — golden threads between distant bookshelves, bridges between unrelated domains made visible only in this light. Dust particles drift through the beam. The rest of the library disappears into infinite darkness. One bridge glows brighter than the others — tonight's finding. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/014-the-muse.png" 2>&1 | tail -1 &

# #015 The Steward
higgsfield gen create nano_banana_2 \
  --prompt "An empty throne at the head of a round table, but the throne is made of interlocking geometric shapes — triangles, circles, hexagons — that shift and reconfigure. The throne doesn't belong to anyone; it belongs to whatever pattern emerges from the debate. Faint afterimages of arguments visible as colored light trails in the air above the table. Amber and dark. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/015-steward.png" 2>&1 | tail -1 &

# #016 The Boxing Engine
higgsfield gen create nano_banana_2 \
  --prompt "A mechanical clockwork mechanism made of boxing elements — gears shaped like fists, springs like jump ropes, pendulums like heavy bags swinging. The mechanism is precise, validated, tested — every component interlocking perfectly. Brass and dark steel with amber highlights. Technical blueprint overlay visible faintly. Engineering meets boxing. Deep dark background. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/016-boxing-engine.png" 2>&1 | tail -1 &

# #017 Cathedral Slides
higgsfield gen create nano_banana_2 \
  --prompt "A deck of cards fanning out in dark space, each card glowing with a different icon and color. The cards are arranged in a spiral pattern, connected by thin golden threads. Some cards face up (live systems), others are dark (frontiers not yet explored). The deck floats above a cathedral floor map. Self-referential — the deck depicting itself. Amber glow, deep black. Cinematic 16:9." \
  --aspect-ratio "16:9" \
  --save "$OUT_DIR/017-cathedral-slides.png" 2>&1 | tail -1 &

echo ""
echo "All 17 jobs submitted. Check: higgsfield gen list"
echo "Images will save to: $OUT_DIR"
