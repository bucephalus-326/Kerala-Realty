// Timing of the reel, in seconds of the final video ("real" time), fitted to the recorded voice-over.
window.FPS = 30;
window.DURATION = 42;

// Voice-over lines (file in incoming/, start in real time).
window.VO = [
  { file: "vo01", at: 0.4 },
  { file: "vo02", at: 4.6 },
  { file: "vo03", at: 9.0 },
  { file: "vo04a", at: 14.8 },
  { file: "vo04b", at: 17.5 },
  { file: "vo04c", at: 19.8 },
  { file: "vo05", at: 24.9 },
  { file: "vo06", at: 28.2 },
  { file: "vo07", at: 32.1 },
  { file: "vo08", at: 38.3 },
];

// The scenes were choreographed on a 31 s draft; this maps real time → draft time so every
// cut lands on the recorded words. Flat stretches hold a scene while a Flow clip plays on top.
window.REMAP = [
  [0, 0], [4.4, 2.7], // hook (Flow A)
  [8.8, 6.0], // fast cuts, verified badge
  [9.7, 6.0], // Flow B grid on the water turns into…
  [11.0, 7.0], [14.4, 10.0], // …the 3D map
  [18.2, 12.6], [19.4, 14.1], // the gift; "Hella" bursts on her name
  [20.7, 14.15], // Flow C: her face lights up
  [21.3, 14.95], [22.45, 16.3], [24.6, 18.0], // orb lands, pin on Kochi, Hella answers
  [26.45, 19.45], [28.0, 20.6], // Manglish typing, results
  [29.4, 21.6], [30.7, 22.6], [31.9, 23.6], // abroad: desk, currency, clocks
  [32.9, 24.4], [33.75, 25.0], [34.65, 25.45], [35.8, 26.2], // owners, agents, admins, one platform
  [37.6, 28.0], // portal
  [38.9, 29.1], [39.4, 29.35], [42.0, 31.0], // logo, build with us
];

// Flow clips: when they play (real time) and from which second of the clip.
window.FLOW = {
  A: { from: 0, to: 4.4, clipAt: 1.0 },
  B: { from: 8.8, to: 9.95, clipAt: 2.6 },
  C: { from: 19.4, to: 20.75, clipAt: 4.0 },
};

// Kinetic captions in real time: words pop in across [t0, t1]; words in `hi` glow cyan.
window.CAPTIONS = [
  { t0: 0.4, t1: 2.2, text: "Finding your home in Kerala…" },
  { t0: 2.55, t1: 4.2, text: "just stepped into the future.", hi: ["future."] },
  { t0: 4.6, t1: 6.35, text: "Every listing checked.", hi: ["checked."] },
  { t0: 6.48, t1: 8.6, text: "Every detail, one tap away.", hi: ["one", "tap"] },
  { t0: 9.0, t1: 12.2, text: "Prices, metro lines, flood zones…" },
  { t0: 12.28, t1: 14.0, text: "alive on a 3D map.", hi: ["3D", "map."] },
  { t0: 14.8, t1: 17.25, text: "And to make your experience even better…", soft: true },
  { t0: 17.5, t1: 18.05, text: "we created", soft: true },
  { t0: 19.8, t1: 21.1, text: "With your permission," },
  { t0: 21.15, t1: 22.4, text: "she knows where you are…" },
  { t0: 22.57, t1: 24.5, text: "and finds the homes that fit you.", hi: ["fit", "you."] },
  { t0: 24.9, t1: 26.4, text: "Talk to her your way." },
  { t0: 26.66, t1: 27.95, text: "Even in Manglish.", hi: ["Manglish."] },
  { t0: 28.2, t1: 29.35, text: "Living abroad?" },
  { t0: 29.51, t1: 30.6, text: "Your currency.", hi: ["currency."] },
  { t0: 30.79, t1: 31.85, text: "Your time zone.", hi: ["time", "zone."] },
  { t0: 32.1, t1: 32.85, text: "Owners." },
  { t0: 32.97, t1: 33.7, text: "Agents." },
  { t0: 33.83, t1: 34.6, text: "Admins." },
  { t0: 34.78, t1: 35.75, text: "One platform.", hi: ["One", "platform."] },
];
