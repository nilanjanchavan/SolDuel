import { AlertCircle } from 'lucide-react'
import { ReactNode } from 'react'

/**
 * Polished banner alert styled for Web3 notifications with optional actions.
 */
export function AppAlert({ action, children }: { action: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/30 text-amber-200 text-xs shadow-lg shadow-amber-950/20 mb-6">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
          <AlertCircle className="h-4 w-4 text-amber-400" />
        </div>
        <div className="leading-relaxed">{children}</div>
      </div>
      {action && <div className="shrink-0 self-end sm:self-auto">{action}</div>}
    </div>
  )
}
