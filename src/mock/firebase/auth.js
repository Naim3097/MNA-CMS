// Mock of firebase/auth — in testing/mock mode any non-empty email + password signs in.
const LS_KEY = 'mna_mock_auth_v1'
let current = load()
const listeners = new Set()

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function save() {
  try {
    if (current) localStorage.setItem(LS_KEY, JSON.stringify(current))
    else localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
function emit() {
  listeners.forEach((cb) => {
    try {
      cb(current)
    } catch (e) {
      console.error('auth listener error', e)
    }
  })
}

export function getAuth() {
  return {
    get currentUser() {
      return current
    },
  }
}

export function onAuthStateChanged(_auth, cb) {
  listeners.add(cb)
  Promise.resolve().then(() => cb(current))
  return () => listeners.delete(cb)
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  if (!email || !password) {
    const err = new Error('Missing credentials')
    err.code = 'auth/invalid-credential'
    throw err
  }
  current = {
    uid: 'mock-' + String(email).replace(/[^a-z0-9]/gi, '').slice(0, 12),
    email,
    displayName: String(email).split('@')[0],
  }
  save()
  emit()
  return { user: current }
}

export async function createUserWithEmailAndPassword(auth, email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function signOut() {
  current = null
  save()
  emit()
}

export default { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
