import { useEffect, useRef } from 'react'

/*
  Dala-style particle constellation, shaped into a brain.
  - Particles are sampled from a brain silhouette image (/assets/brain.png).
    If the image fails to load, a procedural lobe-based silhouette is used.
  - Each sampled point becomes a drifting, twinkling triangle/diamond/dot.
  - Palette: mostly white/fog with a gold accent plus teal/violet sparkle.
  - Sparse particles drift in the surrounding void; subtle mouse parallax.
*/

// Dala-style palette: mostly light particles in the interior, gold/amber on the rim,
// teal/violet as occasional sparkle.
const BASE = ['#ffffff', '#ffffff', '#cecece', '#cecece', '#9a9a9a']
const ACCENT = ['#d9963f', '#d9963f', '#ffb829', '#189b81', '#926aff']
const GOLD = ['#d9963f', '#ffb829', '#d9963f', '#e0a850']
const SPARK = ['#189b81', '#926aff', '#cf7bd6']

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3)
const lerp = (a, b, t) => a + (b - a) * t

export default function ParticleBrain() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 0
    let H = 0
    let particles = []
    let links = []
    let maskImg = null
    let raf = 0
    let resizeTimer = 0
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }

    // ---- Build a brain mask on an offscreen canvas, then sample points ----
    function brainPoints(maskW, maskH, target) {
      const off = document.createElement('canvas')
      off.width = maskW
      off.height = maskH
      const o = off.getContext('2d')

      if (maskImg) {
        // Trace the supplied mask. It can be transparent, white-on-black, or black-on-white.
        o.drawImage(maskImg, 0, 0, maskW, maskH)
      } else {
        const W_ = maskW
        const H_ = maskH
        o.fillStyle = '#fff'
        const ell = (fx, fy, frx, fry) => {
        o.beginPath()
        o.ellipse(fx * W_, fy * H_, frx * W_, fry * H_, 0, 0, Math.PI * 2)
        o.fill()
      }
      // Brain side-profile, built from overlapping lobes (facing left)
      ell(0.49, 0.44, 0.38, 0.33)   // cerebrum — main mass
      ell(0.26, 0.36, 0.17, 0.21)   // frontal lobe (front bulge)
      ell(0.36, 0.21, 0.11, 0.12)   // top gyrus bump
      ell(0.55, 0.18, 0.12, 0.12)   // top gyrus bump
      ell(0.71, 0.24, 0.11, 0.12)   // upper-back gyrus bump
      ell(0.36, 0.69, 0.18, 0.15)   // temporal lobe
      ell(0.52, 0.74, 0.18, 0.14)   // underside
      ell(0.74, 0.68, 0.15, 0.15)   // cerebellum (lower back)
      ell(0.68, 0.85, 0.05, 0.10)   // brain stem
      ell(0.70, 0.89, 0.038, 0.07)  // brain stem tip

      // Carve sulci (folds) so triangles cluster along the gyri
      o.globalCompositeOperation = 'destination-out'
      o.strokeStyle = '#000'
      o.lineWidth = W_ * 0.013
      o.lineCap = 'round'
      const folds = [
        { y: 0.26, x1: 0.30, x2: 0.70, amp: 0.04, n: 2 },
        { y: 0.35, x1: 0.18, x2: 0.80, amp: 0.05, n: 2.5 },
        { y: 0.46, x1: 0.15, x2: 0.84, amp: 0.06, n: 3 },
        { y: 0.57, x1: 0.17, x2: 0.80, amp: 0.05, n: 2.5 },
        { y: 0.66, x1: 0.22, x2: 0.72, amp: 0.045, n: 2 },
      ]
      folds.forEach((f) => {
        o.beginPath()
        const segs = 64
        for (let i = 0; i <= segs; i++) {
          const tt = i / segs
          const x = (f.x1 + (f.x2 - f.x1) * tt) * W_
          const y = (f.y + Math.sin(tt * Math.PI * f.n) * f.amp) * H_
          if (i === 0) o.moveTo(x, y)
          else o.lineTo(x, y)
        }
        o.stroke()
      })
        o.globalCompositeOperation = 'source-over'
      }

      const data = o.getImageData(0, 0, maskW, maskH).data
      let transparent = 0
      const total = maskW * maskH
      const cornerLum = [
        0,
        maskW - 1,
        (maskH - 1) * maskW,
        (maskH - 1) * maskW + maskW - 1,
      ].reduce((sum, idx) => {
        const j = idx * 4
        return sum + (data[j] + data[j + 1] + data[j + 2]) / 3
      }, 0) / 4

      for (let j = 3; j < data.length; j += 4) {
        if (data[j] < 40) transparent++
      }

      const useAlphaMask = maskImg && transparent > total * 0.12
      const lightShape = cornerLum < 128
      const insideAt = (x, y) => {
        if (x < 0 || y < 0 || x >= maskW || y >= maskH) return false
        const j = (y * maskW + x) * 4
        const aa = data[j + 3]
        const ll = (data[j] + data[j + 1] + data[j + 2]) / 3
        if (!maskImg) return aa > 130
        if (useAlphaMask) return aa > 100
        return aa > 100 && (lightShape ? ll > cornerLum + 42 : ll < cornerLum - 42)
      }
      let minX = maskW
      let minY = maskH
      let maxX = 0
      let maxY = 0
      for (let y = 0; y < maskH; y++) {
        for (let x = 0; x < maskW; x++) {
          if (!insideAt(x, y)) continue
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }

      if (minX > maxX || minY > maxY) {
        return { points: [], aspect: maskW / maskH }
      }

      const pad = Math.max(2, Math.round(maskW * 0.012))
      minX = Math.max(0, minX - pad)
      minY = Math.max(0, minY - pad)
      maxX = Math.min(maskW - 1, maxX + pad)
      maxY = Math.min(maskH - 1, maxY + pad)

      const cropW = Math.max(1, maxX - minX)
      const cropH = Math.max(1, maxY - minY)
      const pts = []
      const er = Math.max(3, Math.round(maskW * 0.022)) // rim thickness
      let attempts = 0
      while (pts.length < target && attempts < target * 40) {
        attempts++
        const px = minX + ((Math.random() * cropW) | 0)
        const py = minY + ((Math.random() * cropH) | 0)
        if (!insideAt(px, py)) continue
        // a point is "edge" if any neighbour at rim distance falls outside the shape
        const edge =
          !insideAt(px + er, py) || !insideAt(px - er, py) ||
          !insideAt(px, py + er) || !insideAt(px, py - er) ||
          !insideAt(px + er, py + er) || !insideAt(px - er, py - er) ||
          !insideAt(px + er, py - er) || !insideAt(px - er, py + er)
        pts.push({ x: (px - minX) / cropW, y: (py - minY) / cropH, edge }) // normalized to the cropped brain
      }
      return { points: pts, aspect: cropW / cropH }
    }

    function build() {
      const rect = canvas.getBoundingClientRect()
      W = rect.width
      H = rect.height
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const srcAspect = maskImg ? maskImg.naturalWidth / maskImg.naturalHeight : 420 / 340
      const mh = 420
      const mw = Math.round(mh * srcAspect)
      const target = Math.round(clamp((W * H) / 320, 1500, 2800))
      const sample = brainPoints(mw, mh, target)
      const norm = sample.points
      const brainAspect = clamp(sample.aspect, 1.15, 1.85)

      // Fit the cropped side-profile brain wide, like the Dala hero reference.
      const maxBoxW = W * (W < 760 ? 1.24 : 1.02)
      const maxBoxH = Math.min(H * 0.78, 650)
      let boxW = maxBoxW
      let boxH = boxW / brainAspect
      if (boxH > maxBoxH) {
        boxH = maxBoxH
        boxW = boxH * brainAspect
      }
      const offX = (W - boxW) / 2
      const offY = H * 0.5 - boxH * 0.52
      const centerX = offX + boxW * 0.5
      const centerY = offY + boxH * 0.5
      const brainParticles = norm.map((p) => {
        let color
        let accent
        if (p.edge) {
          // rim -> gold / amber
          color = GOLD[(Math.random() * GOLD.length) | 0]
          accent = true
        } else {
          const c = Math.random()
          if (c < 0.12) { color = SPARK[(Math.random() * SPARK.length) | 0]; accent = true }
          else if (c < 0.2) { color = GOLD[(Math.random() * GOLD.length) | 0]; accent = true }
          else { color = BASE[(Math.random() * BASE.length) | 0]; accent = false }
        }
        const depth = 0.4 + Math.random() * 0.9
        const r = Math.random()
        const shape = r < 0.58 ? 'tri' : r < 0.8 ? 'diamond' : 'dot'
        const hx = offX + p.x * boxW
        const hy = offY + p.y * boxH
        const scatter = 70 + Math.random() * Math.min(W, H) * 0.28
        const angle = Math.atan2(hy - centerY, hx - centerX) + (Math.random() - 0.5) * 1.8
        const size = accent ? 1.3 + Math.random() * 1.9 : 0.7 + Math.random() * 1.7
        const part = {
          hx,
          hy,
          sx: hx + Math.cos(angle) * scatter,
          sy: hy + Math.sin(angle) * scatter,
          isBrain: true,
          size,
          color,
          accent,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.7,
          amp: 1.2 + Math.random() * 3.2,
          baseAlpha: accent ? 0.82 : 0.32 + Math.random() * 0.5,
          twinkle: 0.5 + Math.random() * 1.5,
          depth,
          shape,
        }
        // Bake triangle rotation into vertex offsets once (avoids save/rotate per frame)
        if (shape === 'tri') {
          const s = size * 1.7
          const rot = Math.random() * Math.PI * 2
          const cs = Math.cos(rot)
          const sn = Math.sin(rot)
          part.t0x = s * sn
          part.t0y = -s * cs
          part.t1x = s * 0.87 * cs - s * 0.6 * sn
          part.t1y = s * 0.87 * sn + s * 0.6 * cs
          part.t2x = -s * 0.87 * cs - s * 0.6 * sn
          part.t2y = -s * 0.87 * sn + s * 0.6 * cs
        }
        return part
      })
      particles = brainParticles

      links = []
      const maxLinks = Math.min(220, Math.round(brainParticles.length * 0.06))
      for (let i = 0; i < maxLinks; i++) {
        const a = brainParticles[(Math.random() * brainParticles.length) | 0]
        let b = null
        let best = Infinity
        for (let j = 0; j < 26; j++) {
          const candidate = brainParticles[(Math.random() * brainParticles.length) | 0]
          const dx = candidate.hx - a.hx
          const dy = candidate.hy - a.hy
          const dist = Math.hypot(dx, dy)
          if (dist > 18 && dist < 72 && dist < best) {
            best = dist
            b = candidate
          }
        }
        if (b) links.push({ a, b, phase: Math.random() * Math.PI * 2, color: a.accent ? a.color : '#ffffff' })
      }

      // Sparse drift in the surrounding void
      const drift = Math.round((W * H) / 42000)
      for (let i = 0; i < drift; i++) {
        const accent = Math.random() < 0.1
        particles.push({
          hx: Math.random() * W,
          hy: Math.random() * H,
          sx: Math.random() * W,
          sy: Math.random() * H,
          isBrain: false,
          size: 0.6 + Math.random() * 1.2,
          color: accent ? ACCENT[(Math.random() * ACCENT.length) | 0] : '#858585',
          accent,
          phase: Math.random() * Math.PI * 2,
          speed: 0.15 + Math.random() * 0.35,
          amp: 4 + Math.random() * 10,
          baseAlpha: 0.12 + Math.random() * 0.25,
          twinkle: 0.3 + Math.random() * 0.8,
          depth: 0.2 + Math.random() * 0.5,
          shape: 'dot',
        })
      }
    }

    function draw(now) {
      const t = now * 0.001
      const intro = reduced ? 1 : easeOutCubic(clamp(t / 2.6, 0, 1))
      const breathe = reduced ? 1 : 1 + Math.sin(t * 0.62) * 0.012
      const centerX = W * 0.5
      const centerY = H * 0.49
      // ease parallax target
      mouse.x += (mouse.tx - mouse.x) * 0.05
      mouse.y += (mouse.ty - mouse.y) * 0.05

      ctx.clearRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'

      for (let i = 0; i < links.length; i++) {
        const link = links[i]
        const ax = lerp(link.a.sx, link.a.hx, intro)
        const ay = lerp(link.a.sy, link.a.hy, intro)
        const bx = lerp(link.b.sx, link.b.hx, intro)
        const by = lerp(link.b.sy, link.b.hy, intro)
        ctx.globalAlpha = intro * 0.07 * clamp(0.45 + 0.55 * Math.sin(t * 1.2 + link.phase), 0, 1)
        ctx.strokeStyle = link.color
        ctx.lineWidth = 0.7
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const ox = Math.sin(t * p.speed + p.phase) * p.amp
        const oy = Math.cos(t * p.speed * 0.92 + p.phase) * p.amp
        const baseX = lerp(p.sx, p.hx, p.isBrain ? intro : 1)
        const baseY = lerp(p.sy, p.hy, p.isBrain ? intro : 1)
        const bx = p.isBrain ? centerX + (baseX - centerX) * breathe : baseX
        const by = p.isBrain ? centerY + (baseY - centerY) * breathe : baseY
        const x = bx + ox + mouse.x * 16 * p.depth
        const y = by + oy + mouse.y * 16 * p.depth
        const a = reduced
          ? p.baseAlpha
          : p.baseAlpha * (0.55 + 0.45 * Math.sin(t * p.twinkle + p.phase)) * (p.isBrain ? intro : 1)

        ctx.globalAlpha = a > 0 ? a : 0

        if (p.shape === 'tri') {
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.accent ? 1.05 : 0.75
          ctx.beginPath()
          ctx.moveTo(x + p.t0x, y + p.t0y)
          ctx.lineTo(x + p.t1x, y + p.t1y)
          ctx.lineTo(x + p.t2x, y + p.t2y)
          ctx.closePath()
          ctx.stroke()
        } else if (p.shape === 'diamond') {
          const s = p.size * 1.3
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.accent ? 1 : 0.7
          ctx.beginPath()
          ctx.moveTo(x, y - s)
          ctx.lineTo(x + s, y)
          ctx.lineTo(x, y + s)
          ctx.lineTo(x - s, y)
          ctx.closePath()
          ctx.stroke()
        } else {
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(x, y, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      if (!reduced) raf = requestAnimationFrame(draw)
    }

    function onMouse(e) {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1
    }
    function onResize() {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        build()
        if (reduced) draw(0)
      }, 180)
    }

    build()
    if (reduced) {
      draw(0)
    } else {
      raf = requestAnimationFrame(draw)
      window.addEventListener('mousemove', onMouse)
    }
    window.addEventListener('resize', onResize)

    // Load the brain silhouette; rebuild from it once ready
    const brainImage = new Image()
    brainImage.onload = () => {
      maskImg = brainImage
      build()
      if (reduced) draw(0)
    }
    brainImage.src = '/assets/brain.png'

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(resizeTimer)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" />
}
