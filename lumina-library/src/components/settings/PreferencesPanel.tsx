import { LayoutGrid, List, Palette, Sparkles, Zap } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { SegmentedControl } from '@/components/ui/Tabs'
import { Switch } from '@/components/ui/Switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import type { Preferences } from '@/types'

const ACCENTS: { value: Preferences['accent']; label: string; swatch: string }[] = [
  { value: 'blue', label: 'Electric blue', swatch: 'from-[#5B8CFF] to-[#4272E6]' },
  { value: 'violet', label: 'Violet', swatch: 'from-[#A78BFA] to-[#8A68EE]' },
  { value: 'cyan', label: 'Cyan', swatch: 'from-[#42D9F5] to-[#1FB9D6]' },
]

export function PreferencesPanel({ compact = false }: { compact?: boolean }) {
  const { preferences, setPreferences, isAuthenticated } = useAuth()
  const toast = useToast()

  if (!isAuthenticated) return null

  const update = (patch: Partial<Preferences>) => {
    setPreferences(patch)
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Workspace preferences</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-fg-muted">Applied instantly · stored with your profile</p>
        </div>
        <Sparkles className="size-4 text-violet-400" aria-hidden="true" />
      </CardHeader>
      <CardContent className={cn('space-y-4', compact && 'space-y-3')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-fg-soft">Density</p>
            <p className="text-[11.5px] text-fg-faint">Controls spacing in tables and lists</p>
          </div>
          <SegmentedControl
            aria-label="Interface density"
            size="md"
            value={preferences.density}
            onChange={(value) => update({ density: value })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-soft">
              <Zap className="size-3.5 text-brand-300" aria-hidden="true" /> Motion
            </p>
            <p className="text-[11.5px] text-fg-faint">Reduce animation across the interface</p>
          </div>
          <SegmentedControl
            aria-label="Motion preference"
            size="md"
            value={preferences.motion}
            onChange={(value) => update({ motion: value })}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-fg-soft">Default catalogue view</p>
            <p className="text-[11.5px] text-fg-faint">Used when opening book lists</p>
          </div>
          <SegmentedControl
            aria-label="Default catalogue view"
            size="md"
            value={preferences.defaultCatalogView}
            onChange={(value) => update({ defaultCatalogView: value })}
            options={[
              { value: 'grid', label: 'Grid', icon: <LayoutGrid /> },
              { value: 'list', label: 'List', icon: <List /> },
            ]}
          />
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-soft">
            <Palette className="size-3.5 text-cyan-400" aria-hidden="true" /> Accent colour
          </p>
          <p className="mb-2 text-[11.5px] text-fg-faint">Changes the primary highlight used across the interface</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((accent) => (
              <button
                key={accent.value}
                type="button"
                role="radio"
                aria-checked={preferences.accent === accent.value}
                aria-label={accent.label}
                onClick={() => update({ accent: accent.value })}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors',
                  preferences.accent === accent.value
                    ? 'border-white/25 bg-white/[0.06] text-fg'
                    : 'border-white/8 text-fg-muted hover:border-white/16 hover:text-fg-soft',
                )}
              >
                <span className={cn('size-3.5 rounded-full bg-gradient-to-br', accent.swatch)} aria-hidden="true" />
                {accent.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-white/6 pt-3.5">
          <Switch
            id="pref-email"
            label="Email notifications"
            description="Simulated only — no email is ever sent from this prototype."
            checked={preferences.emailNotices}
            onChange={(checked) => {
              update({ emailNotices: checked })
              toast.info(checked ? 'Email notices enabled' : 'Email notices disabled', 'Demo preference only.')
            }}
          />
          <Switch
            id="pref-due"
            label="Due-date reminders"
            description="Highlight loans that are due within three days."
            checked={preferences.dueSoonReminders}
            onChange={(checked) => update({ dueSoonReminders: checked })}
          />
          <Switch
            id="pref-arrivals"
            label="New arrival alerts"
            description="Show newly catalogued titles on your dashboard."
            checked={preferences.newArrivalAlerts}
            onChange={(checked) => update({ newArrivalAlerts: checked })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
