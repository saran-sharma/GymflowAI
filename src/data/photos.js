/**
 * Photography for the demo — one place to point every image slot.
 *
 * Each key maps to either:
 *   null                      → use the drawn <Scene> artwork (current default)
 *   './img/floor.jpg'         → a file you dropped into `public/img/`
 *   'https://…/photo.jpg'     → any hosted image URL
 *
 * Nothing else needs changing: set a value here and the photo appears, keeping
 * the same framing and brand tint. If an image fails to load — wrong path,
 * offline, host down — the slot silently falls back to the drawn artwork, so a
 * broken photo can never show up mid-pitch.
 *
 * Best source, in order:
 *   1. SLAM's own photos. A gym owner seeing their own floor in the product is
 *      worth more than any stock library.
 *   2. Free commercial-use stock (unsplash.com, pexels.com) — download and put
 *      the files in `public/img/`.
 *
 * Avoid pulling images straight out of an image-search results page: those are
 * other people's copyrighted photos, and this demo is published publicly.
 */

export const photos = {
  // Landing — the three-tile strip under the hero
  strengthFloor: null, // wide shot of the weights floor / racks
  cardioZone: null, // treadmills and cycles
  studio: null, // functional / class area

  // Landing — feature cards
  featureLiveGym: null, // busy floor, people training
  featureAssistant: null, // member on a phone in the gym
  featureInbody: null, // InBody machine or a body-composition scan
  featureEntry: null, // turnstile / entrance / reception
  featureBilling: null, // front desk / payment counter
  featureChannels: null, // member checking their phone

  // PT booking — trainer portraits
  trainer1: null, // Vikas Menon, strength & transformation
  trainer2: null, // Sneha Iyer, fat loss & conditioning
  trainer3: null, // Rahul Deshpande, powerlifting & rehab

  // Member progress — transformation photos, oldest first
  progress1: null,
  progress2: null,
  progress3: null,
  progress4: null,
}

/** Photo credit line, shown under the landing strip when any photo is set. */
export const photoCredit = ''
