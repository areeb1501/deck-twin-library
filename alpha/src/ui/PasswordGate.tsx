/**
 * Demo password gate. The build injects `__DEMO_GATE__` (vite.config.ts): a salt and a PBKDF2-SHA256 hash of
 * DEMO_PASSWORD, never the password itself. The typed password is hashed in the browser and compared; a
 * successful unlock is remembered on this device (booth staff reload) until the password changes.
 *
 * This keeps a public demo URL from being casually opened. It is not access control: everything it guards
 * ships in the bundle.
 */
import { useState, type FormEvent, type ReactNode } from 'react'
import './gate.css'

const KEY = 'deck-twin:gate'
const gate = typeof __DEMO_GATE__ === 'undefined' ? null : __DEMO_GATE__

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const bytes = (h: string) => new Uint8Array(h.match(/../g)?.map((x) => parseInt(x, 16)) ?? [])

async function derive(pw: string, salt: string, iter: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(salt), iterations: iter, hash: 'SHA-256' }, key, 256)
  return hex(bits)
}

function unlocked() {
  if (!gate) return true
  try {
    return localStorage.getItem(KEY) === gate.hash
  } catch {
    return false
  }
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(unlocked)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (open || !gate) return <>{children}</>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!pw || busy) return
    if (!crypto?.subtle) return setErr('This page needs HTTPS to check the password.')
    setBusy(true)
    setErr(null)
    try {
      const h = await derive(pw, gate.salt, gate.iter)
      if (h === gate.hash) {
        try {
          localStorage.setItem(KEY, gate.hash)
        } catch {
          /* private mode: unlock for this load only */
        }
        setOpen(true)
      } else {
        setErr('Incorrect password')
        setPw('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <div className="gate-bg" aria-hidden />
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-eyebrow">Alpha field · offshore digital twin</div>
        <h1>
          Deck Twin
          <span>Production, asset risk and value — live, in one model of the field.</span>
        </h1>
        <ul className="gate-points">
          <li>Five-platform field simulated in real time</li>
          <li>Asset health, spares and supply chain</li>
          <li>Barrels deferred, dollars at risk, carbon</li>
        </ul>
        <label className="gate-field">
          <span>Demo password</span>
          {/* readOnly (not disabled) while checking, so the field keeps focus for a retry */}
          <input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!err} readOnly={busy} />
        </label>
        {err && <div className="gate-err" role="alert">{err}</div>}
        <button type="submit" disabled={!pw || busy}>
          {busy ? 'Checking…' : 'Enter the twin →'}
        </button>
        <p className="gate-foot">Simulated field data for demonstration. Best on a desktop browser with a GPU.</p>
      </form>
    </div>
  )
}
