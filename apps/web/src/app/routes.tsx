import { Outlet, redirect, type RouteObject, type LoaderFunctionArgs } from 'react-router-dom'
import type { QueryClient } from '@tanstack/react-query'
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { authClient } from '~/lib/auth-client'
import { getBrowserClients } from '~/lib/trpc'
import type { Session } from '../../server/auth'
import type { AppRouter } from '../../server/router'
import { DashboardPage } from './dashboard'
import { RouteErrorBoundary } from './error-boundary'
import { Layout } from './layout'
import { PeopleLab } from './lab/people'
import { PlayLab } from './lab/play'
import { SimLab } from './lab/sim'
import { UiLab } from './lab/ui'
import { WorldLab } from './lab/world'
import { PlayPage } from './play'
import { SignInPage } from './sign-in'
import { SignUpPage } from './sign-up'

// Per-request context populated by entry-server.tsx and handed to loaders via
// createStaticHandler.query(req, { requestContext }). Only available SSR-side.
// On the client, loaders fall back to authClient HTTP calls.
export type SsrLoaderContext = {
  session: Session | null
  queryClient: QueryClient
  trpc: TRPCOptionsProxy<AppRouter>
}

export type RootLoaderData = { session: Session | null }

// React Router types loader `context` as `any` in data mode; narrow it here
// instead of casting. Only entry-server.tsx supplies a requestContext.
function isSsrContext(context: unknown): context is SsrLoaderContext {
  return (
    typeof context === 'object' &&
    context !== null &&
    'session' in context &&
    'queryClient' in context &&
    'trpc' in context
  )
}

function ssrContext(context: unknown): SsrLoaderContext {
  if (!isSsrContext(context)) throw new Error('SSR loader ran without entry-server requestContext')
  return context
}

async function fetchClientSession(): Promise<Session | null> {
  const { data, error } = await authClient.getSession()
  if (error || !data) return null
  return data
}

async function rootLoader({ context }: LoaderFunctionArgs): Promise<RootLoaderData> {
  if (typeof window === 'undefined') {
    return { session: ssrContext(context).session }
  }
  return { session: await fetchClientSession() }
}

async function dashboardLoader({ context }: LoaderFunctionArgs): Promise<RootLoaderData> {
  if (typeof window === 'undefined') {
    const ctx = ssrContext(context)
    if (!ctx.session) throw redirect('/sign-in')
    await ctx.queryClient.prefetchQuery(ctx.trpc.posts.list.queryOptions())
    return { session: ctx.session }
  }
  // Client nav: check the session and warm the posts cache in parallel so the
  // dashboard renders with data (a signed-out user's 401 is swallowed by
  // prefetchQuery and the redirect below wins).
  const { queryClient, trpc } = getBrowserClients()
  const [session] = await Promise.all([
    fetchClientSession(),
    queryClient.prefetchQuery(trpc.posts.list.queryOptions()),
  ])
  if (!session) throw redirect('/sign-in')
  return { session }
}

async function redirectIfSignedIn({ context }: LoaderFunctionArgs) {
  const session =
    typeof window === 'undefined' ? ssrContext(context).session : await fetchClientSession()
  if (session) throw redirect('/dashboard')
  return null
}

/** the game and the labs render full-bleed; the starter's auth pages keep their nav layout */
function Shell() {
  return <Outlet />
}

export const routes: RouteObject[] = [
  {
    id: 'root',
    path: '/',
    Component: Shell,
    loader: rootLoader,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, Component: PlayPage },
      { path: 'lab/world', Component: WorldLab },
      { path: 'lab/people', Component: PeopleLab },
      { path: 'lab/sim', Component: SimLab },
      { path: 'lab/ui', Component: UiLab },
      { path: 'lab/play', Component: PlayLab },
      {
        Component: Layout,
        children: [
          { path: 'sign-in', Component: SignInPage, loader: redirectIfSignedIn },
          { path: 'sign-up', Component: SignUpPage, loader: redirectIfSignedIn },
          { path: 'dashboard', Component: DashboardPage, loader: dashboardLoader },
        ],
      },
    ],
  },
]
