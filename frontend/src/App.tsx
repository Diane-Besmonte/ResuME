import { useEffect, useRef, useState } from 'react'

type AuthMode = 'signin' | 'signup'
type AppView = 'landing' | 'auth' | 'app'
type AppPage = 'dashboard' | 'settings'
type JobInputMode = 'url' | 'description'

type Profile = {
  name: string
  email: string
  github: string
  portfolio: string
  resume: string
  background: string
  coverLetter: string
}

type AccountResponse = {
  name: string
  email: string
  github_repo?: string
  portfolio?: string
  resume_filename?: string
  background_filename?: string
  cover_letter_filename?: string
}

type GenerationResult = {
  compatibility_score: number
  docx_url: string
}

const defaultProfile: Profile = {
  name: '', email: '', github: '', portfolio: '', resume: '', background: '', coverLetter: '',
}

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = localStorage.getItem('resume-token')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || 'Request failed')
  }
  return response.status === 204 ? null : response.json()
}

const toProfile = (account: AccountResponse): Profile => ({
  name: account.name,
  email: account.email,
  github: account.github_repo || '',
  portfolio: account.portfolio || '',
  resume: account.resume_filename || '',
  background: account.background_filename || '',
  coverLetter: account.cover_letter_filename || '',
})

const Icon = ({ children, className = 'h-5 w-5' }: { children: React.ReactNode; className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
)

const HomeIcon = () => <Icon><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" /><path d="M9 20v-6h6v6" /></Icon>
const SettingsIcon = () => <Icon><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 3.4 12a2 2 0 0 0-.1-3.4l-.1-.1A2 2 0 1 1 6 5.7l.1.1A2 2 0 0 0 9.5 4.4v-.2a2 2 0 0 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 20.6 12a2 2 0 0 0-1.2 3Z" /></Icon>
const FileIcon = () => <Icon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Icon>
const UploadIcon = () => <Icon><path d="M12 16V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></Icon>
const CheckIcon = () => <Icon className="h-4 w-4"><path d="m5 12 4 4L19 6" /></Icon>

const ArrowUpRight = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
    <path d="M4.5 15.5 15 5m0 0H7m8 0v8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>
)

const Sparkle = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
    <path d="m12 2 1.55 6.45L20 10l-6.45 1.55L12 18l-1.55-6.45L4 10l6.45-1.55L12 2Zm7.1 14.2.65 2.05 2.05.65-2.05.65-.65 2.05-.65-2.05-2.05-.65 2.05-.65.65-2.05Z" fill="currentColor" />
  </svg>
)

const BrandLogo = ({ onClick, light = false }: { onClick: () => void; light?: boolean }) => (
  <button onClick={onClick} className="group flex w-fit items-center gap-2.5" aria-label="Go to ResuME home">
    <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-bold shadow-[0_8px_20px_rgba(75,92,225,0.24)] transition group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_24px_rgba(75,92,225,0.32)] ${light ? 'bg-white/20 text-white' : 'bg-[#4b5ce1] text-white'}`}>R</span>
    <span className={`text-[19px] font-bold tracking-[-0.04em] ${light ? 'text-white' : 'text-[#171a2c]'}`}>Resu<span className={light ? 'text-[#cdd3ff]' : 'text-[#4b5ce1]'}>ME</span></span>
  </button>
)

function AuthPage({ mode, onModeChange, onBack, onAuthenticated }: { mode: AuthMode; onModeChange: (mode: AuthMode) => void; onBack: () => void; onAuthenticated: (email: string, password: string, name: string) => Promise<void> }) {
  const isSignIn = mode === 'signin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true)
    try { await onAuthenticated(email, password, name) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Authentication failed') } finally { setLoading(false) }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f7fb] px-5 py-10 text-[#171a2c]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_5%,rgba(188,220,255,0.7),transparent_35%),radial-gradient(circle_at_85%_10%,rgba(224,204,255,0.85),transparent_36%)]" />
      <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/80 bg-white/75 shadow-[0_28px_80px_rgba(65,75,140,0.16)] backdrop-blur-xl md:grid md:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden bg-[#4b5ce1] p-10 text-white md:flex md:flex-col md:justify-between">
          <BrandLogo onClick={onBack} light />
          <div><p className="text-sm font-semibold text-[#dce1ff]">Your next application, made smarter.</p><h1 className="mt-4 max-w-sm text-4xl font-bold leading-tight tracking-[-0.06em]">Tailor your story to every opportunity.</h1><p className="mt-5 max-w-sm text-sm leading-6 text-[#dce1ff]">ResuME helps you turn one career story into a resume that speaks directly to the job you want.</p></div>
          <p className="text-xs text-[#cdd3ff]">AI-powered resumes, built around you.</p>
        </section>
        <section className="p-7 sm:p-12">
          <div className="mx-auto max-w-sm">
            <div className="mb-8"><h2 className="text-3xl font-bold tracking-[-0.06em]">{isSignIn ? 'Welcome back' : 'Create your account'}</h2><p className="mt-2 text-sm leading-6 text-[#85899c]">{isSignIn ? 'Sign in to keep tailoring your next application.' : 'Start building resumes that move with your career.'}</p></div>
            <div className="grid grid-cols-2 rounded-xl bg-[#f0f2fb] p-1"><button onClick={() => onModeChange('signin')} className={`rounded-lg py-2.5 text-sm font-semibold transition ${isSignIn ? 'bg-white text-[#4b5ce1] shadow-sm' : 'text-[#85899c]'}`}>Sign in</button><button onClick={() => onModeChange('signup')} className={`rounded-lg py-2.5 text-sm font-semibold transition ${!isSignIn ? 'bg-white text-[#4b5ce1] shadow-sm' : 'text-[#85899c]'}`}>Sign up</button></div>
            <div key={mode} className="auth-form-swap min-h-[340px]"><form className="mt-7" onSubmit={submit}><label className="text-xs font-bold text-[#575b70]">Email address<input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-[#e1e3ed] px-4 py-3 text-sm outline-none transition focus:border-[#4b5ce1] focus:ring-4 focus:ring-[#4b5ce1]/10" /></label>{!isSignIn && <label className="mt-4 block text-xs font-bold text-[#575b70]">Your name<input required type="text" value={name} onChange={event => setName(event.target.value)} placeholder="Alex Morgan" className="mt-2 w-full rounded-xl border border-[#e1e3ed] px-4 py-3 text-sm outline-none transition focus:border-[#4b5ce1] focus:ring-4 focus:ring-[#4b5ce1]/10" /></label>}<label className="mt-4 block text-xs font-bold text-[#575b70]">Password<input required minLength={8} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••" className="mt-2 w-full rounded-xl border border-[#e1e3ed] px-4 py-3 text-sm outline-none transition focus:border-[#4b5ce1] focus:ring-4 focus:ring-[#4b5ce1]/10" /></label>{error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}<button disabled={loading} className="mt-6 w-full rounded-xl bg-[#4b5ce1] py-3.5 text-sm font-semibold text-white transition hover:bg-[#3f50d4] disabled:opacity-60">{loading ? 'Please wait…' : isSignIn ? 'Sign in' : 'Create account'} <span className="ml-1">→</span></button></form></div>
            <p className="mt-6 text-center text-xs text-[#85899c]">{isSignIn ? 'New to ResuME?' : 'Already have an account?'} <button onClick={() => onModeChange(isSignIn ? 'signup' : 'signin')} className="font-bold text-[#4b5ce1]">{isSignIn ? 'Create one' : 'Sign in'}</button></p>
          </div>
        </section>
      </div>
    </main>
  )
}

function Sidebar({ page, onPageChange, onSignOut, profile }: { page: AppPage; onPageChange: (page: AppPage) => void; onSignOut: () => void; profile: Profile }) {
  return <aside className="flex w-full shrink-0 flex-col border-b border-[#e8eaf2] bg-white px-5 py-4 lg:sticky lg:top-0 lg:h-screen lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
    <div className="flex items-center justify-between lg:block"><BrandLogo onClick={() => onPageChange('dashboard')} /><button onClick={onSignOut} className="rounded-lg p-2 text-[#8d91a3] hover:bg-[#f3f4fb] lg:hidden" aria-label="Sign out">↗</button></div>
    <nav className="mt-7 flex gap-2 overflow-x-auto lg:mt-12 lg:block lg:space-y-2">
      <button onClick={() => onPageChange('dashboard')} className={`flex min-w-fit items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition lg:w-full ${page === 'dashboard' ? 'bg-[#e9ebff] text-[#4b5ce1]' : 'text-[#777b8d] hover:bg-[#f6f7fc]'}`}><HomeIcon />Dashboard</button>
      <button onClick={() => onPageChange('settings')} className={`flex min-w-fit items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition lg:w-full ${page === 'settings' ? 'bg-[#e9ebff] text-[#4b5ce1]' : 'text-[#777b8d] hover:bg-[#f6f7fc]'}`}><SettingsIcon />Account Settings</button>
    </nav>
    <div className="mt-auto hidden border-t border-[#eceef5] pt-5 lg:block"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e9dcfb] text-sm font-bold text-[#8755bf]">{(profile.name || 'A').charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-[#2d3146]">{profile.name || 'Your account'}</p><p className="truncate text-xs text-[#9296a7]">{profile.email}</p></div></div><button onClick={onSignOut} className="mt-5 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-[#9296a7] hover:bg-[#f6f7fc] hover:text-[#4b5ce1]">Sign out <span className="ml-auto">↗</span></button></div>
  </aside>
}

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onDismiss, 3000); return () => window.clearTimeout(timer) }, [message, onDismiss])
  return <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-[#20243b] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(32,36,59,0.24)]"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#39a779]"><CheckIcon /></span>{message}</div>
}

function Dashboard({ profile }: { profile: Profile }) {
  const [inputMode, setInputMode] = useState<JobInputMode>('url')
  const [jobValue, setJobValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState('')

  const submitJob = (event: React.FormEvent) => { event.preventDefault(); if (!jobValue.trim()) return; setSubmitted(true); setResult(null); setError('') }
  const generateResume = async () => {
    setGenerating(true); setError('')
    try {
      const payload = inputMode === 'url' ? { job_url: jobValue } : { job_description: jobValue }
      setResult(await api('/resume-generations', { method: 'POST', body: JSON.stringify(payload) }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Resume generation failed') } finally { setGenerating(false) }
  }
  const downloadResume = async () => {
    if (!result) return
    try {
      const response = await fetch(`${API_URL}${result.docx_url}`, { headers: { Authorization: `Bearer ${localStorage.getItem('resume-token')}` } })
      if (!response.ok) throw new Error('Download failed')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a'); link.href = url; link.download = 'tailored-resume.docx'; link.click(); URL.revokeObjectURL(url)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Download failed') }
  }
  const profileReady = Boolean(profile.resume || profile.background || profile.coverLetter || profile.github || profile.portfolio)

  return <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[#85899c]">Good morning, {profile.name.split(' ')[0] || 'there'}</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] text-[#20243b] sm:text-4xl">Tailor your resume</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#777b8d]">Start with a job posting and we’ll prepare your resume for the opportunity ahead.</p></div><span className={`hidden rounded-full px-3 py-2 text-xs font-bold sm:inline-flex ${profileReady ? 'bg-[#e9f8f1] text-[#299567]' : 'bg-[#fff0e7] text-[#b66b3d]'}`}>{profileReady ? 'Your profile is ready' : 'Add profile evidence first'}</span></div>
    <section className="mt-9 rounded-2xl border border-[#e4e6f0] bg-white p-5 shadow-[0_18px_50px_rgba(65,75,140,0.06)] sm:p-8"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e9ebff] text-[#4b5ce1]"><FileIcon /></span><div><h2 className="text-lg font-bold text-[#282c43]">Add a job posting</h2><p className="mt-1 text-sm text-[#85899c]">Choose one way to share the role you’re applying for.</p></div></div><div className="mt-7 inline-flex rounded-xl bg-[#f1f2fb] p-1"><button onClick={() => { setInputMode('url'); setSubmitted(false) }} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${inputMode === 'url' ? 'bg-white text-[#4b5ce1] shadow-sm' : 'text-[#85899c]'}`}>Job posting URL</button><button onClick={() => { setInputMode('description'); setSubmitted(false) }} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${inputMode === 'description' ? 'bg-white text-[#4b5ce1] shadow-sm' : 'text-[#85899c]'}`}>Paste description</button></div><form onSubmit={submitJob} className="mt-5"><label className="text-xs font-bold text-[#575b70]">{inputMode === 'url' ? 'Job posting URL' : 'Job description'}<textarea value={jobValue} onChange={event => setJobValue(event.target.value)} rows={inputMode === 'url' ? 3 : 8} placeholder={inputMode === 'url' ? 'https://company.com/careers/job-title' : 'Paste the job description here...'} className="mt-2 w-full resize-none rounded-xl border border-[#e1e3ed] px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-[#b2b5c2] focus:border-[#4b5ce1] focus:ring-4 focus:ring-[#4b5ce1]/10" /></label><div className="mt-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><p className="text-xs text-[#9296a7]">Your job details stay private to your account.</p><button disabled={!jobValue.trim()} className="rounded-xl bg-[#4b5ce1] px-5 py-3 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(75,92,225,0.18)] transition hover:bg-[#3f50d4] disabled:cursor-not-allowed disabled:opacity-50">Save job details <span className="ml-1">→</span></button></div></form></section>
    {submitted && <section className="mt-5 rounded-2xl border border-[#d9e9e2] bg-[#f5fcf8] p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="mt-0.5 grid h-8 w-8 place-items-center rounded-full bg-[#39a779] text-white"><CheckIcon /></span><div><p className="font-bold text-[#286a4e]">Job details saved</p><p className="mt-1 text-sm text-[#5f8976]">Your posting is ready for resume generation.</p></div></div><button onClick={generateResume} disabled={generating || !!result} className="rounded-xl bg-[#286a4e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#205a42] disabled:cursor-not-allowed disabled:opacity-70">{generating ? 'Creating your tailored resume…' : result ? 'Resume created' : 'Create my tailored resume'} {result && <span className="ml-1">✓</span>}</button></div>{generating && <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#d9eee3]"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#39a779]" /></div>}{error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}{result && <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[#d9e9e2] bg-white px-4 py-3 text-sm font-semibold text-[#286a4e]"><span>Your tailored resume is ready — {result.compatibility_score}% match.</span><button onClick={downloadResume} className="rounded-lg bg-[#286a4e] px-4 py-2 text-white">Download DOCX</button></div>}</section>}
    {!submitted && <div className="mt-7 rounded-2xl border border-dashed border-[#dfe2ee] bg-white/60 p-7 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f1e9fb] text-[#8c5ac4]"><Sparkle /></div><h3 className="mt-4 font-bold text-[#383c52]">No applications yet</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#85899c]">Add your first job posting above to start building a resume tailored to the role.</p></div>}
  </main>
}

function FileDropzone({ label, value, onChange }: { label: string; value: string; onChange: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const acceptFile = (file?: File) => { if (file) onChange(file) }
  return <div><p className="mb-2 text-xs font-bold text-[#575b70]">{label}</p><input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={event => acceptFile(event.target.files?.[0])} />{value ? <div className="flex items-center justify-between rounded-xl border border-[#d9e9e2] bg-[#f5fcf8] px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#39a779]"><FileIcon /></span><span className="truncate text-sm font-semibold text-[#286a4e]">{value}</span></div><button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-bold text-[#7d9c8d] hover:text-[#286a4e]">Replace</button></div> : <button type="button" onClick={() => inputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); acceptFile(event.dataTransfer.files[0]) }} className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#cfd3e2] bg-[#fafbfe] px-5 py-7 text-center transition hover:border-[#4b5ce1] hover:bg-[#f7f8ff]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9ebff] text-[#4b5ce1]"><UploadIcon /></span><span className="mt-3 text-sm font-bold text-[#4b5ce1]">Drop a file here or browse</span><span className="mt-1 text-xs text-[#9296a7]">PDF or DOCX, up to 5 MB</span></button>}</div>
}

function SettingsPage({ profile, onSave }: { profile: Profile; onSave: (profile: Profile, files: Partial<Record<'resume' | 'background' | 'coverLetter', File>>) => Promise<Profile> }) {
  const [draft, setDraft] = useState(profile)
  const [files, setFiles] = useState<Partial<Record<'resume' | 'background' | 'coverLetter', File>>>({})
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(profile), [profile])
  const update = (key: keyof Profile, value: string) => setDraft(current => ({ ...current, [key]: value }))
  const selectFile = (key: 'resume' | 'background' | 'coverLetter', file: File) => { setFiles(current => ({ ...current, [key]: file })); update(key, file.name) }
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try { setDraft(await onSave(draft, files)); setFiles({}); setToast('Account settings saved') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save settings') } finally { setSaving(false) }
  }
  return <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12"><div><p className="text-sm font-semibold text-[#85899c]">Your account</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] text-[#20243b]">Account Settings</h1><p className="mt-3 text-sm leading-6 text-[#777b8d]">Keep your profile and career documents ready for every application.</p></div><form onSubmit={save} className="mt-9 rounded-2xl border border-[#e4e6f0] bg-white p-5 shadow-[0_18px_50px_rgba(65,75,140,0.06)] sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><label className="text-xs font-bold text-[#575b70]">Name<input required value={draft.name} onChange={event => update('name', event.target.value)} className="mt-2 w-full rounded-xl border border-[#e1e3ed] px-4 py-3 text-sm outline-none focus:border-[#4b5ce1] focus:ring-4 focus:ring-[#4b5ce1]/10" /></label><label className="text-xs font-bold text-[#575b70]">Email address<input required type="email" value={draft.email} onChange={event => update('email', event.target.value)} className="mt-2 w-full rounded-xl border border-[#e1e3ed] px-4 py-3 text-sm outline-none focus:border-[#4b5ce1] focus:ring-4 focus:ring-[#4b5ce1]/10" /></label><label className="text-xs font-bold text-[#575b70]">GitHub repository<input value={draft.github} onChange={event => update('github', event.target.value)} placeholder="https://github.com/you/project" className="mt-2 w-full rounded-xl border border-[#e1e3ed] px-4 py-3 text-sm outline-none placeholder:text-[#b2b5c2] focus:border-[#4b5ce1] focus:ring-4 focus:ring-[#4b5ce1]/10" /></label><label className="text-xs font-bold text-[#575b70]">Portfolio<input value={draft.portfolio} onChange={event => update('portfolio', event.target.value)} placeholder="https://yourportfolio.com" className="mt-2 w-full rounded-xl border border-[#e1e3ed] px-4 py-3 text-sm outline-none placeholder:text-[#b2b5c2] focus:border-[#4b5ce1] focus:ring-4 focus:ring-[#4b5ce1]/10" /></label></div><div className="my-8 border-t border-[#eceef5]" /><div><h2 className="text-base font-bold text-[#282c43]">Career documents</h2><p className="mt-1 text-sm text-[#85899c]">Upload the latest materials you want ResuME to use.</p></div><div className="mt-6 space-y-5"><FileDropzone label="Recent resume" value={draft.resume} onChange={file => selectFile('resume', file)} /><FileDropzone label="Background document" value={draft.background} onChange={file => selectFile('background', file)} /><FileDropzone label="Cover letter (optional)" value={draft.coverLetter} onChange={file => selectFile('coverLetter', file)} /></div>{error && <p className="mt-5 text-sm font-semibold text-red-600">{error}</p>}<div className="mt-8 flex justify-end border-t border-[#eceef5] pt-6"><button disabled={saving} className="rounded-xl bg-[#4b5ce1] px-5 py-3 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(75,92,225,0.18)] transition hover:bg-[#3f50d4] disabled:opacity-60">{saving ? 'Saving…' : 'Save changes'}</button></div></form>{toast && <Toast message={toast} onDismiss={() => setToast('')} />}</main>
}

function AuthenticatedApp({ onSignOut }: { onSignOut: () => void }) {
  const [page, setPage] = useState<AppPage>('dashboard')
  const [profile, setProfile] = useState<Profile>(defaultProfile)
  const [loading, setLoading] = useState(true)
  useEffect(() => { api('/account').then(account => setProfile(toProfile(account))).catch(onSignOut).finally(() => setLoading(false)) }, [onSignOut])
  const saveProfile = async (nextProfile: Profile, files: Partial<Record<'resume' | 'background' | 'coverLetter', File>>) => {
    let account: AccountResponse = await api('/account', { method: 'PATCH', body: JSON.stringify({ name: nextProfile.name, email: nextProfile.email, github_repo: nextProfile.github || null, portfolio: nextProfile.portfolio || null }) })
    for (const [key, file] of Object.entries(files)) {
      if (!file) continue
      const kind = key === 'coverLetter' ? 'cover_letter' : key
      const form = new FormData(); form.append('document', file)
      account = await api(`/account/documents/${kind}`, { method: 'POST', body: form })
    }
    const saved = toProfile(account); setProfile(saved); return saved
  }
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f7f8fc] text-sm font-semibold text-[#777b8d]">Loading your profile…</main>
  return <div className="min-h-screen bg-[#f7f8fc] text-[#171a2c] lg:flex"><Sidebar page={page} onPageChange={setPage} onSignOut={onSignOut} profile={profile} /><div className="min-w-0 flex-1">{page === 'dashboard' ? <Dashboard profile={profile} /> : <SettingsPage profile={profile} onSave={saveProfile} />}</div></div>
}

function App() {
  const [view, setView] = useState<AppView>(() => localStorage.getItem('resume-token') ? 'app' : 'landing')
  const [authMode, setAuthMode] = useState<AuthMode>('signin')

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode)
    setView('auth')
  }

  const authenticate = async (email: string, password: string, name: string) => {
    const path = authMode === 'signin' ? '/auth/sign-in' : '/auth/register'
    const body = authMode === 'signin' ? { email, password } : { email, password, name }
    const response = await api(path, { method: 'POST', body: JSON.stringify(body) })
    localStorage.setItem('resume-token', response.access_token)
    setView('app')
  }

  const signOut = () => {
    api('/auth/sign-out', { method: 'POST' }).catch(() => null).finally(() => {
      localStorage.removeItem('resume-token')
      setView('landing')
    })
  }

  if (view === 'auth') {
    return <AuthPage mode={authMode} onModeChange={setAuthMode} onBack={() => setView('landing')} onAuthenticated={authenticate} />
  }

  if (view === 'app') {
    return <AuthenticatedApp onSignOut={signOut} />
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#f5f7fb] text-[#171a2c]">
      <div className="absolute inset-x-0 top-0 -z-0 h-[760px] bg-[radial-gradient(circle_at_15%_5%,rgba(188,220,255,0.65),transparent_35%),radial-gradient(circle_at_85%_10%,rgba(224,204,255,0.8),transparent_36%)]" />
      <div className="absolute left-[-130px] top-[470px] -z-0 h-[340px] w-[340px] rounded-full bg-[#dceaff] blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <BrandLogo onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

        <nav className="hidden items-center gap-9 text-sm font-medium text-[#6c7083] md:flex">
          <a href="#features" className="transition hover:text-[#171a2c]">Features</a>
          <a href="#how-it-works" className="transition hover:text-[#171a2c]">How it works</a>
          <a href="#about" className="transition hover:text-[#171a2c]">About</a>
        </nav>

        <div className="flex items-center gap-3">
          <button onClick={() => openAuth('signin')} className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-[#4b51a0] transition hover:bg-white/70 sm:block">Sign in</button>
          <button onClick={() => openAuth('signup')} className="rounded-full bg-[#4b5ce1] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(75,92,225,0.22)] transition hover:-translate-y-0.5 hover:bg-[#3f50d4]">Get started <span className="ml-1">→</span></button>
        </div>
      </header>

      <main id="top" className="relative z-10 mx-auto max-w-7xl px-6 pb-16 pt-16 lg:px-10 lg:pt-24">
        <section className="grid items-center gap-14 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dbe0fa] bg-white/70 px-3.5 py-2 text-xs font-semibold text-[#5960af] shadow-sm backdrop-blur">
              <Sparkle />
              Your resume, tailored for the role you want
            </div>
            <h1 className="text-[3.5rem] font-bold leading-[1.02] tracking-[-0.075em] text-[#121525] sm:text-[4.8rem]">
              One resume.
              <span className="block text-[#4b5ce1]">Every opportunity.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-[#686d7f]">
              ResuME uses AI to shape your experience around every job posting. Paste the role you want, get a tailored resume in minutes, and show employers exactly why you’re a fit.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => openAuth('signup')} className="group flex items-center justify-center gap-2 rounded-xl bg-[#4b5ce1] px-6 py-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(75,92,225,0.25)] transition hover:-translate-y-1 hover:bg-[#3f50d4]">
                Build my resume <ArrowUpRight />
              </button>
              <button onClick={() => openAuth('signin')} className="rounded-xl border border-[#dce0eb] bg-white/75 px-6 py-4 text-sm font-semibold text-[#3d4263] transition hover:border-[#bbc2ee] hover:bg-white">I already have an account</button>
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-[#777b8b]">
              <div className="flex -space-x-2">
                {['#f2b28c', '#8cb7e8', '#a5d5bc', '#d1a9df'].map((color, index) => <span key={color} className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#f5f7fb] text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{['A', 'J', 'M', 'S'][index]}</span>)}
              </div>
              <span><strong className="text-[#33374c]">Built for every application</strong> — one profile, smarter resumes</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[650px] lg:pt-8">
            <div className="absolute -right-5 top-0 hidden rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_45px_rgba(79,84,146,0.15)] sm:block">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#4b5ce1]"><Sparkle /> Job match score</div>
              <div className="flex items-end gap-3"><span className="text-3xl font-bold text-[#20243b]">92</span><span className="mb-1 text-xs font-medium text-[#39a779]">+18% this week</span></div>
            </div>
            <div className="overflow-hidden rounded-[26px] border-[7px] border-white/90 bg-white shadow-[0_28px_70px_rgba(65,75,140,0.18)]">
              <div className="flex h-12 items-center justify-between border-b border-[#eef0f6] px-5">
                <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-md bg-[#4b5ce1] text-[10px] font-bold text-white">R</span><span className="text-xs font-bold tracking-[-0.03em]">ResuME</span></div>
                <div className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d8dbea]" /><span className="h-2 w-2 rounded-full bg-[#d8dbea]" /><span className="h-2 w-2 rounded-full bg-[#d8dbea]" /></div>
              </div>
              <div className="flex min-h-[390px] bg-[#fafbff]">
                <aside className="hidden w-40 shrink-0 bg-[#f1f3fe] p-4 sm:block">
                  <div className="mb-8 h-2.5 w-20 rounded bg-[#d7dcfa]" />
                  {['Overview', 'My resumes', 'Job matches', 'Settings'].map((item, i) => <div key={item} className={`mb-4 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-medium ${i === 0 ? 'bg-[#4b5ce1] text-white shadow-md' : 'text-[#85899c]'}`}><span className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-white' : 'bg-[#c4c8dd]'}`} />{item}</div>)}
                </aside>
                <div className="flex-1 p-5 sm:p-7">
                  <div className="flex items-start justify-between"><div><p className="text-[10px] font-medium text-[#9a9db0]">Good morning, Alex</p><h2 className="mt-1 text-lg font-bold tracking-[-0.04em] text-[#20243b]">Your resume is ready for this role.</h2></div><span className="grid h-8 w-8 place-items-center rounded-full bg-[#eadcfb] text-xs font-bold text-[#8c5ac4]">A</span></div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-xl border border-[#eceef5] bg-white p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold text-[#696e82]">Match with this job</span><span className="rounded-full bg-[#e9f8f1] px-2 py-1 text-[9px] font-bold text-[#39a779]">Excellent</span></div><div className="mt-5 flex items-center gap-4"><div className="relative grid h-20 w-20 place-items-center rounded-full" style={{ background: 'conic-gradient(#4b5ce1 92%, #e9ebf5 0)' }}><div className="grid h-14 w-14 place-items-center rounded-full bg-white text-xl font-bold text-[#303657]">92</div></div><p className="max-w-[110px] text-[10px] leading-4 text-[#8c90a1]">Your experience matches the role’s top skills.</p></div></div>
                    <div className="rounded-xl bg-[#4b5ce1] p-4 text-white"><p className="text-[10px] font-semibold text-[#dbe0ff]">AI suggestion</p><p className="mt-3 text-sm font-semibold leading-5">Highlight your product strategy experience.</p><div className="mt-5 h-1.5 rounded-full bg-white/25"><div className="h-full w-3/4 rounded-full bg-white" /></div><p className="mt-2 text-[9px] text-[#dbe0ff]">3 tailored improvements available</p></div>
                  </div>
                  <div className="mt-4 rounded-xl border border-[#eceef5] bg-white p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold text-[#696e82]">Recent activity</span><span className="text-[9px] font-semibold text-[#4b5ce1]">View all</span></div>{['Product Designer resume', 'Marketing CV template'].map((item, i) => <div key={item} className="mt-4 flex items-center justify-between"><div className="flex items-center gap-3"><span className={`grid h-7 w-7 place-items-center rounded-lg text-[10px] font-bold ${i === 0 ? 'bg-[#e8ebff] text-[#4b5ce1]' : 'bg-[#fff0e7] text-[#de8b58]'}`}>{i === 0 ? 'P' : 'M'}</span><div><p className="text-[10px] font-semibold text-[#41455b]">{item}</p><p className="mt-0.5 text-[9px] text-[#a2a5b3]">Edited 2 days ago</p></div></div><span className="text-[9px] text-[#a2a5b3]">•••</span></div>)}</div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-7 -left-7 hidden w-52 rounded-2xl border border-white/80 bg-white/95 p-4 shadow-[0_18px_45px_rgba(79,84,146,0.15)] sm:block"><div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-[#e9f8f1] text-[#39a779]">✓</div><p className="text-sm font-bold text-[#282c43]">ATS-friendly</p><p className="mt-1 text-[10px] leading-4 text-[#85899c]">Your resume is ready to make an impression.</p></div>
          </div>
        </section>

        <section id="how-it-works" className="mt-28 scroll-mt-8 border-t border-[#e1e4ef] pt-14">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4b5ce1]">How it works</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.05em] text-[#20243b] sm:text-4xl">A better resume in four simple steps.</h2>
            <p className="mt-4 text-sm leading-6 text-[#777b8b]">Give ResuME the opportunity you want. We’ll help you turn your experience into a resume made for it.</p>
          </div>

          <div className="relative mt-12 grid gap-5 md:grid-cols-4 md:gap-4">
            <div className="absolute left-[12%] right-[12%] top-7 hidden h-px bg-[#dfe3f6] md:block" />
            <div className="relative rounded-2xl border border-[#e5e7f0] bg-white/70 p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(75,92,225,0.08)]"><div className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8ebff] text-lg font-bold text-[#4b5ce1] ring-8 ring-[#f5f7fb]">01</div><h3 className="mt-6 font-bold text-[#282c43]">Share the job</h3><p className="mt-2 text-sm leading-6 text-[#7c8090]">Paste a job posting link or add the role details and information directly.</p></div>
            <div className="relative rounded-2xl border border-[#e5e7f0] bg-white/70 p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(75,92,225,0.08)]"><div className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e9f8f1] text-lg font-bold text-[#39a779] ring-8 ring-[#f5f7fb]">02</div><h3 className="mt-6 font-bold text-[#282c43]">Create your resume</h3><p className="mt-2 text-sm leading-6 text-[#7c8090]">Click Create Resume and let ResuME understand what this opportunity needs.</p></div>
            <div className="relative rounded-2xl border border-[#e5e7f0] bg-white/70 p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(75,92,225,0.08)]"><div className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#fff0e7] text-lg font-bold text-[#de8b58] ring-8 ring-[#f5f7fb]">03</div><h3 className="mt-6 font-bold text-[#282c43]">Let AI do the magic</h3><p className="mt-2 text-sm leading-6 text-[#7c8090]">In moments, your experience is shaped into a tailored, role-focused resume.</p></div>
            <div className="relative rounded-2xl border border-[#e5e7f0] bg-white/70 p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(75,92,225,0.08)]"><div className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f1e9fb] text-lg font-bold text-[#8c5ac4] ring-8 ring-[#f5f7fb]">04</div><h3 className="mt-6 font-bold text-[#282c43]">Review & export</h3><p className="mt-2 text-sm leading-6 text-[#7c8090]">Review the generated resume, make it yours, and export it ready to send.</p></div>
          </div>
        </section>

        <section id="features" className="mt-28 border-t border-[#e1e4ef] pt-10"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4b5ce1]">Built around your next move</p><h2 className="mt-3 text-3xl font-bold tracking-[-0.05em] text-[#20243b]">Make every application count.</h2></div><p className="max-w-sm text-sm leading-6 text-[#777b8b]">Keep your experience at the center while AI adapts your resume to the opportunity in front of you.</p></div><div className="mt-8 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-[#e5e7f0] bg-white/65 p-6"><span className="text-2xl">✦</span><h3 className="mt-5 font-bold text-[#282c43]">Understand the job</h3><p className="mt-2 text-sm leading-6 text-[#7c8090]">Paste a job posting and ResuME finds the skills, language, and priorities that matter.</p></div><div className="rounded-2xl border border-[#e5e7f0] bg-white/65 p-6"><span className="text-2xl">◫</span><h3 className="mt-5 font-bold text-[#282c43]">Adapt with AI</h3><p className="mt-2 text-sm leading-6 text-[#7c8090]">Turn the same career story into a focused resume that speaks directly to each role.</p></div><div className="rounded-2xl border border-[#e5e7f0] bg-white/65 p-6"><span className="text-2xl">↗</span><h3 className="mt-5 font-bold text-[#282c43]">Apply with confidence</h3><p className="mt-2 text-sm leading-6 text-[#7c8090]">Get clear feedback, stronger wording, and an ATS-friendly resume ready to send.</p></div></div></section>

        <section id="about" className="mt-28 scroll-mt-8 border-t border-[#e1e4ef] pt-14">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4b5ce1]">The people behind ResuME</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.05em] text-[#20243b] sm:text-4xl">Meet the developers.</h2>
            <p className="mt-4 text-sm leading-6 text-[#777b8b]">A small, curious team building a more personal way to prepare for your next opportunity.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#e5e7f0] bg-white/70 p-5 transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(75,92,225,0.08)]"><div className="grid h-20 w-20 place-items-center rounded-2xl bg-[#fff0e7] text-5xl" role="img" aria-label="Dog spirit animal">🐶</div><p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#4b5ce1]">Meet Sebo</p><h3 className="mt-1 text-lg font-bold text-[#282c43]">Full-stack developer</h3><p className="mt-3 text-sm leading-6 text-[#7c8090]">A thoughtful builder who turns big ideas into friendly, reliable product experiences.</p></div>
            <div className="rounded-2xl border border-[#e5e7f0] bg-white/70 p-5 transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(75,92,225,0.08)]"><div className="grid h-20 w-20 place-items-center rounded-2xl bg-[#e8ebff] text-5xl" role="img" aria-label="Owl spirit animal">🦉</div><p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#4b5ce1]">Meet Matt</p><h3 className="mt-1 text-lg font-bold text-[#282c43]">Full-stack developer</h3><p className="mt-3 text-sm leading-6 text-[#7c8090]">A calm problem-solver who brings sharp thinking and elegant systems to every challenge.</p></div>
            <div className="rounded-2xl border border-[#e5e7f0] bg-white/70 p-5 transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(75,92,225,0.08)]"><div className="grid h-20 w-20 place-items-center rounded-2xl bg-[#e9f8f1] text-5xl" role="img" aria-label="Capybara spirit animal">🦫</div><p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#4b5ce1]">Meet Diane</p><h3 className="mt-1 text-lg font-bold text-[#282c43]">Full-stack developer</h3><p className="mt-3 text-sm leading-6 text-[#7c8090]">A steady creative who makes complex workflows feel simple, useful, and surprisingly joyful.</p></div>
            <div className="rounded-2xl border border-[#e5e7f0] bg-white/70 p-5 transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(75,92,225,0.08)]"><div className="grid h-20 w-20 place-items-center rounded-2xl bg-[#f1e9fb] text-5xl" role="img" aria-label="Dolphin spirit animal">🐬</div><p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#4b5ce1]">Meet Yughie</p><h3 className="mt-1 text-lg font-bold text-[#282c43]">Full-stack developer</h3><p className="mt-3 text-sm leading-6 text-[#7c8090]">A curious maker who keeps the team moving with inventive ideas and a lot of positive energy.</p></div>
          </div>
        </section>
      </main>

    </div>
  )
}

export default App
