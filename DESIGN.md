---
name: EMESE
description: Custom supplies with your logo, shown as a factory tech pack
colors:
  sheet-bg: "#fbfbfa"
  sheet-white: "#ffffff"
  surface: "#f0f0ee"
  ink: "#141414"
  ink-soft: "#545450"
  line: "rgba(20, 20, 20, .13)"
  rule: "rgba(20, 20, 20, .9)"
  grid: "rgba(20, 20, 20, .045)"
  cyan: "#00a3e0"
  magenta: "#e6007e"
  yellow: "#ffe500"
  dark-bg: "#111212"
  dark-sheet: "#18191a"
  dark-ink: "#f1f1ef"
  dark-ink-soft: "#a9a9a5"
  studio-room: "#141414"
typography:
  display:
    fontFamily: "Alexandria, IBM Plex Sans Arabic, sans-serif"
    fontSize: "5rem"
    fontWeight: 800
    lineHeight: 1.45
    letterSpacing: "0em"
  section:
    fontFamily: "Alexandria, IBM Plex Sans Arabic, sans-serif"
    fontSize: "3.6rem"
    fontWeight: 800
    lineHeight: 1.5
  range:
    fontFamily: "Alexandria, IBM Plex Sans Arabic, sans-serif"
    fontSize: "2.4rem"
    fontWeight: 800
    lineHeight: 1.4
  body:
    fontFamily: "IBM Plex Sans Arabic, Alexandria, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.8
  measure:
    fontFamily: "IBM Plex Mono, IBM Plex Sans Arabic, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.4
  brand:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "31px"
    fontWeight: 400
    lineHeight: 1
rounded:
  none: "0px"
  sm: "2px"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  plate-pad: "clamp(18px, 2.4vw, 30px)"
  range-gap: "clamp(56px, 7vw, 88px)"
  section: "clamp(72px, 10vw, 128px)"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-bg}"
    rounded: "{rounded.sm}"
    padding: "16px 26px"
  button-whatsapp:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.measure}"
    rounded: "{rounded.sm}"
    padding: "16px 26px"
  callout-tag:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "6px 9px"
  range-tab:
    textColor: "{colors.ink}"
    padding: "14px 18px"
  range-tab-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-bg}"
---

## Overview
A garment factory's tech pack for the customer's own order. Every product photo sits in a framed plate with crop marks, and its print spot is called out by a leader line from the logo to a label: technique, placement and size. Arabic first (right to left), light by default, dark available.

## Colors
Cool white sheets and ink. Hairline `line` separates, `rule` closes a heading block. The faint `grid` appears only on measurement surfaces (the hero spec sheet, the studio room). Cyan, magenta and yellow are the print-shop identity: registration marks, the callout pin, the active tick, the techniques strip dots, and the step and technique colour blocks the owner asked to keep. Never warm cream.

## Typography
Alexandria 800 for headings, IBM Plex Sans Arabic for body, IBM Plex Mono only for measurements and data (sizes, counts, technique lists, the phone number). DM Serif Display only in the "EMESE." wordmark with its magenta dot.

## Layout
Hero: copy and the position legend on the start side, the spec plate with five product thumbnails on the end side; on phones the plate sits between the buttons and the legend. Products: six ranges grouped by who orders them, a sticky range bar, a ruled range head (title, audience in mono, description), and a grid whose shape follows the count (lead plate 2x2 for five, 3 columns for six, 2 for two, lead plus a stack for three).

## Elevation & Depth
Flat. The hero sheet alone carries a soft offset shadow (0 18px 40px -24px). No hard offset block shadows.

## Shapes
Square: 0 to 2px radius everywhere. Crop marks at plate corners. Pins are the only circles.

## Components
Plate with callout (`js/ranges.js`): leader drawn with stroke-dashoffset, pin scales in, tag reveals with clip-path; this is the page's one motion moment, also run when the hero changes product every 5 seconds. Studio stays a dark room. Quote form and WhatsApp end every path.

## Do's and Don'ts
- Do show the logo on every product and say how it is made.
- Do keep every claim true: sizes are usual placements, no prices, clients or years.
- Don't put labels above headings, use em dashes, or use mono for anything but measurements.
- Don't use the striped "EMESE custom supplies" mark as the logo.
