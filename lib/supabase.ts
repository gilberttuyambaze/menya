import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

const supabaseUrl = (() => {
  if (!url) return null

  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
      ? parsedUrl.toString()
      : null
  } catch {
    return null
  }
})()

export const supabaseConfigurationError = url && !supabaseUrl
  ? 'VITE_SUPABASE_URL must be a valid absolute HTTP or HTTPS URL.'
  : ''

export const supabase = supabaseUrl && anonKey ? createClient(supabaseUrl, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null
export const supabaseConfigured = Boolean(supabase)
