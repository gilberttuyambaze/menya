interface SparklineProps {
  data?: number[]
  color?: 'gold' | 'cyan' | 'violet' | 'emerald'
  height?: number
  width?: number
}

export function Sparkline({
  data = [18, 22, 19, 27, 24, 32, 29, 38, 35, 42, 48],
  color = 'gold',
  height = 42,
  width = 140,
}: SparklineProps) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const paddingX = 4
  const paddingY = 6
  const innerWidth = width - paddingX * 2
  const innerHeight = height - paddingY * 2

  const points = data.map((val, idx) => {
    const x = paddingX + (idx / (data.length - 1)) * innerWidth
    const y = height - paddingY - ((val - min) / range) * innerHeight
    return { x, y }
  })

  // Build smooth cubic bezier curve
  let pathD = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i]
    const next = points[i + 1]
    const controlX = (current.x + next.x) / 2
    pathD += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`
  }

  const fillD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`

  const colorMap = {
    gold: { stroke: '#FFD700', stop1: 'rgba(255, 215, 0, 0.35)', stop2: 'rgba(255, 215, 0, 0.0)' },
    cyan: { stroke: '#00E5FF', stop1: 'rgba(0, 229, 255, 0.35)', stop2: 'rgba(0, 229, 255, 0.0)' },
    violet: { stroke: '#A855F7', stop1: 'rgba(168, 85, 247, 0.35)', stop2: 'rgba(168, 85, 247, 0.0)' },
    emerald: { stroke: '#10B981', stop1: 'rgba(16, 185, 129, 0.35)', stop2: 'rgba(16, 185, 129, 0.0)' },
  }

  const currentColors = colorMap[color]
  const gradId = `sparkGrad-${color}-${Math.random().toString(36).slice(2, 7)}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline-svg"
      style={{ width, height, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={currentColors.stop1} />
          <stop offset="100%" stopColor={currentColors.stop2} />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${gradId})`} />
      <path
        d={pathD}
        fill="none"
        stroke={currentColors.stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End pulse dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="3"
        fill={currentColors.stroke}
      />
    </svg>
  )
}

