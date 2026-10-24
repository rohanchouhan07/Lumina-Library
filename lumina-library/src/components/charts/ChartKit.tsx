import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/Feedback'

export const CHART_COLORS = {
  brand: '#5B8CFF',
  violet: '#A78BFA',
  cyan: '#42D9F5',
  positive: '#22C98A',
  warn: '#F5B222',
  danger: '#F56565',
  grid: 'rgba(255,255,255,0.06)',
  axis: '#647086',
}

export const CATEGORY_COLORS = [
  '#5B8CFF',
  '#A78BFA',
  '#42D9F5',
  '#22C98A',
  '#F5B222',
  '#F56565',
  '#8FA8D9',
]

const axisProps = {
  stroke: CHART_COLORS.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

interface TooltipPayloadItem {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

function ChartTooltip({
  active,
  payload,
  label,
  suffix = '',
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/12 bg-ink-850/98 px-2.5 py-2 shadow-xl backdrop-blur">
      {label !== undefined && (
        <p className="mb-1 text-[11px] font-medium tracking-wide text-fg-muted uppercase">{label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((item) => (
          <div key={`${item.dataKey}`} className="flex items-center gap-2 text-[12px]">
            <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden="true" />
            <span className="text-fg-muted capitalize">{item.name}</span>
            <span className="ml-auto font-medium text-fg tabular-nums">
              {item.value}
              {suffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartFrame({
  title,
  description,
  action,
  children,
  height = 240,
  isEmpty = false,
  emptyLabel = 'No data for this period',
  className,
  summary,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  height?: number
  isEmpty?: boolean
  emptyLabel?: string
  className?: string
  summary?: string
}) {
  return (
    <section
      className={cn('surface-card flex flex-col rounded-xl p-4 sm:p-5', className)}
      aria-label={title}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold tracking-tight text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-[11.5px] text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      {summary && <p className="sr-only">{summary}</p>}
      <div style={{ height }} className="w-full">
        {isEmpty ? (
          <div className="grid h-full place-items-center">
            <EmptyState compact title={emptyLabel} description="Adjust the filters to see more activity." />
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

export function CirculationChart({
  data,
}: {
  data: { month: string; issued: number; returned: number }[]
}) {
  const reduced = useReducedMotion()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barGap={4}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="month" {...axisProps} dy={6} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 11, color: '#8B96A9', paddingBottom: 6 }}
        />
        <Bar
          dataKey="issued"
          name="Issued"
          fill={CHART_COLORS.brand}
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
          isAnimationActive={!reduced}
          animationDuration={800}
        />
        <Bar
          dataKey="returned"
          name="Returned"
          fill={CHART_COLORS.violet}
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
          isAnimationActive={!reduced}
          animationDuration={800}
          animationBegin={120}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CategoryDonut({
  data,
  showLegend = true,
}: {
  data: { category: string; copies: number }[]
  showLegend?: boolean
}) {
  const reduced = useReducedMotion()
  const total = data.reduce((sum, entry) => sum + entry.copies, 0)
  return (
    <div className="flex h-full flex-col gap-2 sm:flex-row sm:items-center">
      <div className="h-[160px] w-full sm:h-full sm:min-w-0 sm:flex-1">
        <ResponsiveContainer width="100%" height="100%" debounce={40}>
          <PieChart>
            <Pie
              data={data}
              dataKey="copies"
              nameKey="category"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="rgba(9,11,16,0.6)"
              strokeWidth={2}
              isAnimationActive={!reduced}
              animationDuration={800}
            >
              {data.map((entry, index) => (
                <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip suffix=" copies" />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {showLegend && (
        <ul className="shrink-0 space-y-1 sm:w-[48%]">
          {data.map((entry, index) => (
            <li key={entry.category} className="flex items-center gap-1.5 text-[10.5px] text-fg-muted">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{entry.category}</span>
              <span className="shrink-0 tabular-nums text-fg-faint">{entry.copies}</span>
            </li>
          ))}
          <li className="flex items-center justify-between border-t border-white/6 pt-1 text-[10.5px] text-fg-soft">
            <span>Total</span>
            <span className="tabular-nums">{total}</span>
          </li>
        </ul>
      )}
    </div>
  )
}

export function TrendAreaChart({
  data,
  dataKey,
  name,
  color = CHART_COLORS.brand,
  suffix = '',
}: {
  data: Record<string, string | number>[]
  dataKey: string
  name: string
  color?: string
  suffix?: string
}) {
  const reduced = useReducedMotion()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="month" {...axisProps} dy={6} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${dataKey})`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#0B0E15' }}
          isAnimationActive={!reduced}
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function OverdueLineChart({ data }: { data: { month: string; overdue: number }[] }) {
  const reduced = useReducedMotion()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="month" {...axisProps} dy={6} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
        <Line
          type="monotone"
          dataKey="overdue"
          name="Overdue"
          stroke={CHART_COLORS.danger}
          strokeWidth={2}
          dot={{ r: 2.5, fill: CHART_COLORS.danger, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          isAnimationActive={!reduced}
          animationDuration={900}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function PopularBooksChart({
  data,
}: {
  data: { title: string; count: number }[]
}) {
  const reduced = useReducedMotion()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="title"
          {...axisProps}
          width={130}
          tick={{ fill: '#8B96A9', fontSize: 10.5 }}
        />
        <Tooltip content={<ChartTooltip suffix=" loans" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar
          dataKey="count"
          name="Loans"
          fill={CHART_COLORS.cyan}
          radius={[0, 4, 4, 0]}
          maxBarSize={14}
          isAnimationActive={!reduced}
          animationDuration={800}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function AvailabilityChart({ data }: { data: { month: string; issued: number; returned: number }[] }) {
  const reduced = useReducedMotion()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="month" {...axisProps} dy={6} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
        <Line
          type="monotone"
          dataKey="issued"
          name="Issued"
          stroke={CHART_COLORS.brand}
          strokeWidth={2}
          dot={false}
          isAnimationActive={!reduced}
        />
        <Line
          type="monotone"
          dataKey="returned"
          name="Returned"
          stroke={CHART_COLORS.positive}
          strokeWidth={2}
          dot={false}
          isAnimationActive={!reduced}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={26}
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 11, color: '#8B96A9' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
