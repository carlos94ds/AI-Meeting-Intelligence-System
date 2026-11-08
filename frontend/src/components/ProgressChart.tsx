import { BarChart3, Table2 } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatShortDate } from '@/lib/format'
import type { MeetingProgressPoint } from '@/lib/types'

/** Reeksen: kleuren gevalideerd met de dataviz-validator (zie --viz-* in index.css). */
const SERIES = [
  { key: 'open', label: 'Open', color: 'var(--viz-open)' },
  { key: 'done', label: 'Afgerond', color: 'var(--viz-done)' },
] as const

interface Row {
  label: string
  title: string
  date: string
  open: number
  done: number
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Row
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-foreground">{row.title}</div>
      <div className="mb-1.5 text-muted-foreground">{formatDate(row.date)}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
          <span className="font-medium text-foreground tabular-nums">{row[s.key]}</span>
        </div>
      ))}
    </div>
  )
}

export function ProgressChart({ points }: { points: MeetingProgressPoint[] }) {
  const [view, setView] = useState<'grafiek' | 'tabel'>('grafiek')
  const data: Row[] = points.map((p) => ({ label: formatShortDate(p.date), title: p.title, date: p.date, open: p.open, done: p.done }))

  return (
    <figure className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <figcaption>
          <div className="text-sm font-semibold">Open versus afgerond per vergadering</div>
          <div className="text-xs text-muted-foreground">Stand van de actiepunten aan het eind van elke vergaderdag</div>
        </figcaption>
        <div role="group" aria-label="Weergave" className="inline-flex rounded-lg border p-0.5">
          <Button variant={view === 'grafiek' ? 'secondary' : 'ghost'} size="xs" aria-pressed={view === 'grafiek'} onClick={() => setView('grafiek')}>
            <BarChart3 /> Grafiek
          </Button>
          <Button variant={view === 'tabel' ? 'secondary' : 'ghost'} size="xs" aria-pressed={view === 'tabel'} onClick={() => setView('tabel')}>
            <Table2 /> Tabel
          </Button>
        </div>
      </div>

      {view === 'grafiek' ? (
        <>
          <ul className="mb-2 flex gap-4 text-xs text-muted-foreground" aria-label="Legenda">
            {SERIES.map((s) => (
              <li key={s.key} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
          <div className="h-64" role="img" aria-label={`Staafdiagram: ${data.map((d) => `${d.title}: ${d.open} open, ${d.done} afgerond`).join('; ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={2} barCategoryGap="30%" margin={{ top: 18, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vergadering</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Afgerond</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.date}>
                <TableCell>{d.title}</TableCell>
                <TableCell>{formatDate(d.date)}</TableCell>
                <TableCell className="text-right tabular-nums">{d.open}</TableCell>
                <TableCell className="text-right tabular-nums">{d.done}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </figure>
  )
}
