# Design System

<!-- impeccable:design-schema 1 -->

## Visual World: Cinema Dark Studio

Inspired by modern creative engineering workstations (OpusClip, Linear, Teenage Engineering, Runway). Built for video creators: dark obsidian backgrounds that make video footage and kinetic karaoke subtitles pop with extreme clarity and zero eye fatigue.

## Palette

- **Background:** `oklch(0.14 0.008 260)` (#0c0d10, Deep Obsidian Canvas)
- **Surface:** `oklch(0.17 0.01 260)` (#121317, Workstation Panel)
- **Card:** `oklch(0.18 0.01 260)` (#15161c, Elevated Surface)
- **Border / Hairlines:** `oklch(1 0 0 / 11%)` (1px precision divider)
- **Foreground:** `oklch(0.96 0.005 260)` (#f4f4f7, Crisp Ivory Typography)
- **Muted Foreground:** `oklch(0.68 0.015 260)` (Secondary Technical Text)
- **Primary Accent:** `oklch(0.74 0.16 65)` (#f59e0b, Radiant Solar Amber, contrast > 5.5:1 against dark surfaces)
- **Accent Foreground:** `oklch(0.12 0.01 260)` (Deep Charcoal text on Amber buttons)
- **Success:** `oklch(0.70 0.15 150)` (Emerald Active Indicator)

## Typography

- **Display Face:** `Space Grotesk`, tight letter spacing (`tracking-[-0.035em]`), bold weights (700, 800)
- **Body Face:** `DM Sans` / UI Sans, clean rhythm, line length capped at 55–65 characters
- **Code / Metrics:** Monospace, tabular numerals for timecodes (`00:54`) and percentages (`100%`)

## Component Rules

1. **No AI Slop:** No generic cards inside cards, no fake gradient text, no blurred orb decorations, no kickers above headers.
2. **Tactile Hardware Feel:** Controls look and feel like physical studio hardware buttons with clear active states.
3. **Living Canvas:** Live video playback, interactive style presets, and real virality score meters.
