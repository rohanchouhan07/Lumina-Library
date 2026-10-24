import { BrowserRouter, HashRouter } from 'react-router-dom'
import { AppProviders } from './providers'
import { AppRoutes } from './router'

/**
 * The regular app uses clean URLs. The bundled single-file preview runs inside a
 * sandboxed iframe where the history API is unreliable, so it uses hash routing.
 */
const useHashRouter = import.meta.env.VITE_ROUTER === 'hash'

export default function App() {
  return (
    <AppProviders>
      {useHashRouter ? (
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      ) : (
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      )}
    </AppProviders>
  )
}
