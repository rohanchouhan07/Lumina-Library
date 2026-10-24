import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CloudOff, Loader2, PlugZap, RefreshCw, Server, TriangleAlert } from 'lucide-react'
import { API_BASE_URL, IS_API_CONFIGURED } from '@/config/env'
import { probeBackend } from '@/services/apiClient'
import { useAuth } from '@/providers/AuthProvider'
import { useLibrary } from '@/providers/LibraryProvider'
import { useToast } from '@/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { InlineAlert } from '@/components/ui/Feedback'

type Probe = Awaited<ReturnType<typeof probeBackend>>

/**
 * Connection & sync status.
 *
 * Everything here is honest about what the app actually does: writes go through
 * the Apps Script API to Google Sheets, the browser never holds sheets
 * credentials, and refresh is explicit or polled — never "real-time".
 */
export function ConnectionPanel() {
  const { mode, role } = useAuth()
  const { syncing, lastSyncedAt, dataError, refresh } = useLibrary()
  const toast = useToast()
  const [probe, setProbe] = useState<Probe | null>(null)
  const [probing, setProbing] = useState(false)

  const runProbe = useCallback(async () => {
    setProbing(true)
    try {
      setProbe(await probeBackend())
    } finally {
      setProbing(false)
    }
  }, [])

  useEffect(() => {
    void runProbe()
  }, [runProbe])

  const handleRefresh = async () => {
    const result = await refresh()
    if (result.ok) toast.success('Records refreshed', 'The latest rows were read from Google Sheets.')
    else toast.error('Refresh failed', result.error)
  }

  const healthy = probe?.ok ?? false

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Connection &amp; sync</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-fg-muted">
            {mode === 'live'
              ? 'Data is read from and written to Google Sheets through an Apps Script API.'
              : 'This build runs on local sample data — no backend is configured.'}
          </p>
        </div>
        <Badge tone={mode === 'live' ? (healthy ? 'success' : 'warn') : 'outline'}>
          {mode === 'live' ? (healthy ? 'Connected' : 'Unreachable') : 'Demo mode'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <dl className="grid gap-2 text-[12px] sm:grid-cols-2">
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
            <dt className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-fg-faint uppercase">
              <Server className="size-3" aria-hidden="true" /> API endpoint
            </dt>
            <dd className="mt-1 truncate font-mono text-[11px] text-fg-soft">
              {IS_API_CONFIGURED ? API_BASE_URL : 'not configured (VITE_API_BASE_URL unset)'}
            </dd>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
            <dt className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-fg-faint uppercase">
              {healthy ? <CheckCircle2 className="size-3" aria-hidden="true" /> : <CloudOff className="size-3" aria-hidden="true" />}
              Health check
            </dt>
            <dd className="mt-1 truncate text-[11px] text-fg-soft">
              {probing && !probe
                ? 'Checking…'
                : probe
                  ? `${probe.message}${probe.latencyMs != null ? ` · ${probe.latencyMs} ms` : ''}`
                  : 'Not checked'}
            </dd>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
            <dt className="text-[10.5px] tracking-wide text-fg-faint uppercase">Last successful read</dt>
            <dd className="mt-1 text-[11px] text-fg-soft">
              {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : mode === 'live' ? 'Not yet' : 'Local sample data'}
            </dd>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
            <dt className="text-[10.5px] tracking-wide text-fg-faint uppercase">Signed-in role</dt>
            <dd className="mt-1 text-[11px] text-fg-soft">{role ?? 'guest'} · read from the server</dd>
          </div>
        </dl>

        {mode === 'live' && dataError && (
          <InlineAlert tone="danger" title="Last sync failed">
            {dataError}
          </InlineAlert>
        )}

        {mode === 'live' && (
          <InlineAlert tone="info" title="How syncing works">
            Records load when you sign in, refresh after every change you make, and poll every two minutes while this
            tab is open. Edits made directly in the spreadsheet appear after the next refresh — there is no
            real-time push.
          </InlineAlert>
        )}

        {mode === 'demo' && (
          <InlineAlert tone="info" title="Demo data only">
            Nothing is sent anywhere. Set <code className="font-mono text-[11px]">VITE_API_BASE_URL</code> to your
            deployed Apps Script <code className="font-mono text-[11px]">/exec</code> URL to connect a real library
            spreadsheet.
          </InlineAlert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={runProbe}
            disabled={probing}
            leftIcon={probing ? <Loader2 className="animate-spin" /> : <PlugZap />}
          >
            {probing ? 'Checking…' : 'Test connection'}
          </Button>
          {mode === 'live' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={syncing}
              leftIcon={<RefreshCw className={syncing ? 'animate-spin' : undefined} />}
            >
              {syncing ? 'Refreshing…' : 'Refresh records now'}
            </Button>
          )}
        </div>

        {mode === 'live' && probe && !probe.ok && (
          <p className="flex items-start gap-1.5 text-[11px] text-warning-300">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            Confirm the deployment is set to “Execute as: me” and “Who has access: anyone”, then redeploy as a new
            version.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
