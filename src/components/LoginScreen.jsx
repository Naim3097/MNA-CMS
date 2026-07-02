import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebaseConfig'
import { logoBase64 } from '../assets/logo'

function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
      onLoginSuccess && onLoginSuccess()
    } catch (err) {
      let msg = 'Login failed. Please check your credentials.'
      if (err.code === 'auth/user-not-found') msg = 'No account found with this email. Contact your administrator.'
      else if (err.code === 'auth/wrong-password') msg = 'Incorrect password. Please try again.'
      else if (err.code === 'auth/invalid-email') msg = 'Invalid email address format.'
      else if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Please try again later.'
      else if (err.code === 'auth/network-request-failed') msg = 'Network error. Check your internet connection.'
      else if (err.code === 'auth/invalid-credential') msg = 'Invalid credentials. Check email and password.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {logoBase64 ? (
            <img src={logoBase64} alt="MNA Dynamic Torque" className="h-16 w-auto mx-auto mb-4" />
          ) : (
            <div className="text-2xl font-semibold tracking-tight text-ink">MNA Dynamic Torque</div>
          )}
          <p className="text-sm text-muted mt-1">Workshop Management — Staff Sign In</p>
        </div>

        <form onSubmit={handleLogin} className="card space-y-5">
          <div>
            <label htmlFor="email" className="field-label">Staff email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
              autoComplete="email"
              placeholder="you@mnadynamictorque.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
          )}

          <button type="submit" disabled={loading} className="btn-primary btn-block">
            {loading ? (
              <>
                <span className="loading-spinner mr-2" style={{ borderTopColor: '#fff' }}></span>
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {import.meta.env.VITE_USE_MOCK !== 'false' && (
          <p className="text-center text-xs text-muted mt-6">Testing mode — sign in with any email &amp; password.</p>
        )}
        <p className="text-center text-xs text-faint mt-3">MNA Dynamic Torque — Management System</p>
      </div>
    </div>
  )
}

export default LoginScreen
