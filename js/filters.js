/** Canvas `ctx.filter` strings per the spec's filter list. */
export const FILTERS = {
  original: "none",
  bw: "grayscale(1)",
  vintage: "sepia(.6) contrast(1.1)",
  sunset: "sepia(.3) saturate(1.4) hue-rotate(-10deg)",
  warm: "brightness(1.1) sepia(.2)",
  cool: "hue-rotate(180deg) saturate(.8)",
};

export const FILTER_LABELS = {
  original: "Original",
  bw: "B&W",
  vintage: "Vintage",
  sunset: "Sunset",
  warm: "Warm Glow",
  cool: "Cool Blue",
};
