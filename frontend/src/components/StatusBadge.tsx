const palette: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  processed: 'bg-green-100 text-green-800',
  error:     'bg-red-100 text-red-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-red-100 text-red-800',
  corrected: 'bg-blue-100 text-blue-800',
  info:      'bg-blue-100 text-blue-800',
  warning:   'bg-orange-100 text-orange-800',
}

export default function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls = palette[status] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
