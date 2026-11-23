# Promo reel: "Entry to the future"

9:16 · 1080×1920 · 30 fps · 31 s · Instagram Reels + LinkedIn
Mood: dark, neon cyan/blue (NovaTech colours) with the app's green, glass panels, light streaks, speed ramps, slow-mo on key moments.
No product name on screen. The bot is called **Hella** in the video only.

---

## 1. Voice-over script (ElevenLabs)

Make **one audio file per line**, named as below (MP3 or WAV). I place each one at its exact time and cut the pictures to your real timing, so small differences are fine.

**Voice:** female, warm, confident, smiling, slight Indian-English accent. Think premium tech launch, not a radio ad.
Suggested settings (Multilingual v2 or v3): Stability 35–45 · Similarity 75 · Style 25–35 · Speaker boost on.
Tip: generate each line 3 times and keep the best take.

| File | Starts at | Line | Delivery |
|---|---|---|---|
| `vo01.mp3` | 0.3 s | Finding your home in Kerala… just stepped into the future. | Hushed start, opening up on "future" |
| `vo02.mp3` | 2.9 s | Every listing checked. Every detail, one tap away. | Crisp, quick |
| `vo03.mp3` | 6.2 s | Prices, metro lines, flood zones… alive on a 3D map. | Wonder on "alive" |
| `vo04a.mp3` | 10.3 s | And to make your experience even better… | Slow, intimate, a smile in the voice |
| `vo04b.mp3` | 12.6 s | we created Hella. | Proud reveal, the gift moment |
| `vo04c.mp3` | 14.4 s | With your permission, she knows where you are… and finds the homes that fit you. | Warm, reassuring |
| `vo05.mp3` | 18.2 s | Talk to her your way. Even in Manglish. | Playful on "Manglish" |
| `vo06.mp3` | 20.8 s | Living abroad? Your currency. Your time zone. | Three quick beats |
| `vo07.mp3` | 23.8 s | Owners, agents, admins. One platform. | Confident, punchy |
| `vo08.mp3` | 28.0 s | NovaTech. Build with us. | Lower, slower, signature line |

Hella's name: if ElevenLabs says "Hela" or "Heller", type it as **"Hellah"**.

---

## 2. Shot list

| Time | Shot | Picture | Motion |
|---|---|---|---|
| 0.0–2.7 | S1 Hook | **Flow clip A**: dawn drone over Kerala backwaters, light grid sweeps across the water | Slow push-in; caption "THE FUTURE OF HOME" assembles letter by letter |
| 2.7–6.0 | S2 Fast cuts | Real app on a phone: search hero → homes flying in → listing photo → "K-RERA verified" badge | Cuts on every beat, whip-pans, last cut goes **slow-mo** on the badge with a light sweep |
| 6.0–10.0 | S3 Map | Real 3D map: price-heat columns, metro lines, the camera orbits Kochi | Speed ramp: fast orbit → **slow-mo** as the columns glow |
| 10.0–14.2 | S4a The gift | Screen dims; a box made of light appears, unwraps; particles swirl into a glowing orb; the name **Hella** writes itself in light | Hold, slow, then a burst of light on "Hella" |
| 14.2–18.0 | S4b She finds you | A location pin drops on Kochi with a pulse ring; Hella's chat card blooms open with homes near you | Cards stagger in, slight parallax |
| 18.0–20.6 | S5 Manglish | Typing "kakkanad il 50 lakh flat venam"; real results appear | Typing in real time, results in **slow-mo** |
| 20.6–23.6 | S6 Abroad | NRI dashboard: two clocks (Dubai and Kerala), prices in AED | Three hard cuts, numbers count up |
| 23.6–26.2 | S7 One platform | Owner dashboard → document vault (fingerprint) → admin analytics | Glitch transitions, one shot per word |
| 26.2–29.0 | S8 Portal | **Flow clip B**: a glowing doorway of blue light opens in the dark, the camera flies through (it echoes the door in the NovaTech logo) | Flash to white-blue on entry |
| 29.0–31.0 | End card | NovaTech logo assembles from particles · "Build with us" · novamatic119@gmail.com · small "Product demo · sample listings" | Logo light sweep, hold |

---

## 3. Google Flow prompts

Settings for all clips: **9:16 portrait**, highest quality (Veo 3 / Veo 3 Quality), 8 seconds. Generate 2–4 versions of each and keep the best. I remove the clip's own sound, so don't worry about it.

**Clip A: Hook (backwaters into the future)**
> Vertical 9:16 cinematic aerial drone shot at blue-hour dawn over the Kerala backwaters, a traditional wooden houseboat gliding on mirror-still water between coconut palms, mist on the water. Slow forward push. Halfway through, thin lines of glowing cyan light sweep across the water surface and trace the shoreline like a holographic map grid, then fade. Deep navy and teal colour grade with cyan highlights, anamorphic lens, high contrast, premium tech commercial look, ultra-detailed, no text, no logos, no people visible.

**Clip B: The portal (before the logo)**
> Vertical 9:16 cinematic shot in total darkness, a tall rectangular doorway made of glowing electric-blue light slowly opens in front of the camera, light spilling across a reflective black floor, fine particles drifting in the beam. The camera glides forward and flies through the doorway into bright cyan-white light. Minimal, futuristic, sleek, volumetric light, high contrast, premium tech brand reveal, no text, no logos, no people.

**Optional clip C: The human moment (for the Hella reveal)**
> Vertical 9:16 close-up at night on a balcony overlooking a softly lit Kochi skyline, a young Indian woman looks down at her phone and her face lights up with a surprised, delighted smile as warm cyan light from the screen glows on her face. Shallow depth of field, bokeh city lights, cinematic, warm and joyful, premium commercial look, no text, no logos, the phone screen is not visible.

Name the files `flowA.mp4`, `flowB.mp4` and `flowC.mp4`.

---

## 4. Music (ElevenLabs Music, or any licensed track)

> Futuristic cinematic electronic, 128 BPM, 32 seconds. Dark pulsing synth bass and soft arpeggios for 10 seconds with rising tension; at 10 seconds a sudden drop to near silence with shimmering pads (a magical reveal); a warm, uplifting build from 12 to 26 seconds with punchy drums and wide synths; at 26 seconds a big riser into a deep impact at 29 seconds, then a long reverb tail. Premium tech-launch feel, no vocals.

File: `music.mp3`. If it's longer, that's fine; I'll edit to the cut.

## 5. Sound effects (ElevenLabs Sound Effects)

| File | At | Prompt |
|---|---|---|
| `sfx_whoosh.mp3` | cuts (reused) | short airy cinematic whoosh, fast pass-by, clean, 0.5 seconds |
| `sfx_glitch.mp3` | 23.6–26 s | short digital glitch stutter, futuristic UI, 0.4 seconds |
| `sfx_riser.mp3` | 8.0–10.0 s | 2-second tension riser, airy synth, ends abruptly |
| `sfx_reveal.mp3` | 12.6 s | magical sparkling chime reveal, gift opening, crystalline, joyful, 2 seconds |
| `sfx_pin.mp3` | 14.4 s | soft futuristic location ping with a low pulse, 1 second |
| `sfx_typing.mp3` | 18.2 s | light fast typing on a glass touchscreen, 1.5 seconds |
| `sfx_pop.mp3` | card appears | tiny soft UI pop, glassy, 0.2 seconds |
| `sfx_impact.mp3` | 29.0 s | deep cinematic logo impact boom with shimmering tail, 3 seconds |

Send whatever you make. Anything missing, I can leave out or reuse another sound.
