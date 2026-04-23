import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = (import.meta.env.VITE_SUPABASE_URL as string)
  || 'https://vzzzqsmqqaoilkmskadl.supabase.co'
const SUPABASE_KEY  = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enpxc21xcWFvaWxrbXNrYWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjYzMjQsImV4cCI6MjA5MTQ0MjMyNH0.vYkiz5BeoJlhNzcEiiGQfsHLE5UfqJbTTBjNXk1xxJs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
