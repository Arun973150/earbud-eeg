# Earbud-based EEG Monitoring System — Website

A single-page showcase site for the MSRIT CSP67 Mini Project
**"Earbud-based EEG Monitoring System"**.

## Design
- **Hero centerpiece:** a procedural **particle-constellation brain** rendered on
  `<canvas>` (thousands of drifting, twinkling particles sampled into a brain
  silhouette) — inspired by the *Dala* style reference.
- **Everything else:** the *Ciridae* style system — noir `#0b0b0b` canvas, a single
  copper-ember `#cc6437` accent (decorative only), condensed type (Barlow Condensed),
  ghost pill controls, flat surfaces, generous spacing.
- All copy is sourced from the project report (abstract, problem, objectives, the
  acquisition → CNN-GRU → alert pipeline, performance metrics, team, future scope).

## Tech
Vite + React 18, plain CSS with custom-property design tokens (`src/index.css`).
No UI framework, no shadows/gradients — depth comes from surface tone + scale.

## Run
```bash
npm install      # first time only
npm run dev      # start dev server  -> http://localhost:5173
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Structure
```
index.html               # fonts (Barlow Condensed, Roboto Mono, Inter)
src/
  main.jsx               # React entry
  index.css              # design tokens + all component styles
  data.js                # all report-sourced content
  App.jsx                # page composition + all sections
  components/
    ParticleBrain.jsx    # the canvas brain constellation
    Nav.jsx              # fixed nav + star-burst brand mark
```

## Customising
- **Brain density / colour:** tweak `target` (point count), `EMBER` ratio (`0.12`)
  and the drift count in `ParticleBrain.jsx`.
- **Content:** edit `src/data.js`.
- **Palette / type / spacing:** edit the tokens at the top of `src/index.css`.
- Respects `prefers-reduced-motion` (renders a static brain, no twinkle/parallax).
