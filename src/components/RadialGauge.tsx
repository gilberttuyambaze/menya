interface RadialGaugeProps {
  score: number
  maxScore?: number
  label?: string
}

export function RadialGauge({ score, maxScore = 100, label }: RadialGaugeProps) {
  const percentage = Math.min(100, Math.max(0, Math.round((score / maxScore) * 100)))
  // Semi-circle radius & circumference (180 deg)
  const radius = 38
  const strokeWidth = 8
  const cx = 50
  const cy = 48
  const semiCircumference = Math.PI * radius // ~119.38
  const strokeDashoffset = semiCircumference * (1 - percentage / 100)

  return (
    <div className="radial-gauge-container">
      <svg viewBox="0 0 100 60" className="radial-gauge-svg">
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="45%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#FFD700" />
          </linearGradient>
          <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background track arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Active progress arc with glow */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={semiCircumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          filter="url(#gaugeGlow)"
          className="radial-gauge-progress"
        />

        {/* Center score readout */}
        <text
          x={cx}
          y={cy - 5}
          textAnchor="middle"
          className="radial-gauge-score"
          fill="#FFFFFF"
        >
          {percentage}%
        </text>
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          className="radial-gauge-scale"
          fill="#64748B"
        >
          {label ?? `${maxScore}`}
        </text>
      </svg>
    </div>
  )
}

