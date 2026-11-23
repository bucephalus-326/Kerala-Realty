// Timing of the reel, in seconds. When the real voice-over arrives, adjust VO starts and
// caption chunks here; scenes read their cut points from SCENES.
window.FPS = 30;
window.DURATION = 31;

// Voice-over lines (file, start). Used by the mixer and to time captions.
window.VO = [
  { file: "vo01", at: 0.3 },
  { file: "vo02", at: 2.9 },
  { file: "vo03", at: 6.2 },
  { file: "vo04a", at: 10.3 },
  { file: "vo04b", at: 12.6 },
  { file: "vo04c", at: 14.4 },
  { file: "vo05", at: 18.2 },
  { file: "vo06", at: 20.8 },
  { file: "vo07", at: 23.8 },
  { file: "vo08", at: 28.0 },
];

// Kinetic captions: words pop in across [t0, t1]; words in `hi` glow cyan.
window.CAPTIONS = [
  { t0: 0.3, t1: 1.45, text: "Finding your home in Kerala…" },
  { t0: 1.45, t1: 2.65, text: "just stepped into the future.", hi: ["future."] },
  { t0: 2.9, t1: 4.2, text: "Every listing checked.", hi: ["checked."] },
  { t0: 4.2, t1: 5.9, text: "Every detail, one tap away.", hi: ["one", "tap"] },
  { t0: 6.2, t1: 7.9, text: "Prices, metro lines, flood zones…" },
  { t0: 7.9, t1: 9.5, text: "alive on a 3D map.", hi: ["3D", "map."] },
  { t0: 10.3, t1: 12.3, text: "And to make your experience even better…", soft: true },
  { t0: 12.55, t1: 13.0, text: "we created", soft: true },
  { t0: 14.4, t1: 16.2, text: "With your permission, she knows where you are…" },
  { t0: 16.2, t1: 17.9, text: "and finds the homes that fit you.", hi: ["fit", "you."] },
  { t0: 18.2, t1: 19.3, text: "Talk to her your way." },
  { t0: 19.3, t1: 20.5, text: "Even in Manglish.", hi: ["Manglish."] },
  { t0: 20.8, t1: 21.6, text: "Living abroad?" },
  { t0: 21.6, t1: 22.6, text: "Your currency.", hi: ["currency."] },
  { t0: 22.6, t1: 23.5, text: "Your time zone.", hi: ["time", "zone."] },
  { t0: 23.8, t1: 24.4, text: "Owners." },
  { t0: 24.4, t1: 25.0, text: "Agents." },
  { t0: 25.0, t1: 25.5, text: "Admins." },
  { t0: 25.5, t1: 26.3, text: "One platform.", hi: ["One", "platform."] },
];
