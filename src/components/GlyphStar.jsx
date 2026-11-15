// Four-pointed star mark used across the brand: nav, cards, footer.
export default function GlyphStar({ className = 'starburst', size }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      <path className="ember" d="M12 7 L13 11 L17 12 L13 13 L12 17 L11 13 L7 12 L11 11 Z" />
    </svg>
  )
}
