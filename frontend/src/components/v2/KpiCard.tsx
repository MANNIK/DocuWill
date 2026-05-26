import Card from './Card'

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  valueStyle?: React.CSSProperties
}

export default function KpiCard({ label, value, sub, valueStyle }: KpiCardProps) {
  return (
    <Card className="q-kpi">
      <div className="q-kpi-label">{label}</div>
      <div className="q-kpi-value" style={valueStyle}>{value}</div>
      {sub && <div className="q-kpi-sub">{sub}</div>}
    </Card>
  )
}
