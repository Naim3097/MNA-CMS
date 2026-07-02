// Mock of firebase/firestore — in-memory store with real-time listeners, queries,
// batches and Timestamps. Persisted to localStorage so flow-testing data survives reloads.
// Matches the modular Firestore API surface the app actually uses.
import { buildSeed } from '../seed'

const LS_KEY = 'mna_mock_db_v1'

/* ─────────────────────────── Timestamp ─────────────────────────── */
export class Timestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }
  toDate() {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6))
  }
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6)
  }
  valueOf() {
    return this.toMillis()
  }
  static now() {
    return Timestamp.fromMillis(Date.now())
  }
  static fromDate(d) {
    return Timestamp.fromMillis(d.getTime())
  }
  static fromMillis(m) {
    return new Timestamp(Math.floor(m / 1000), (m % 1000) * 1e6)
  }
}
export function serverTimestamp() {
  return Timestamp.now()
}
// Field-transform sentinels (rarely used by the app; supported for safety)
export function arrayUnion(...values) {
  return { __transform: 'arrayUnion', values }
}
export function arrayRemove(...values) {
  return { __transform: 'arrayRemove', values }
}
export function increment(n) {
  return { __transform: 'increment', by: n }
}

/* ─────────────────────────── helpers ─────────────────────────── */
function genId() {
  return 'm' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
function deepClone(v) {
  if (v == null) return v
  if (v instanceof Timestamp) return new Timestamp(v.seconds, v.nanoseconds)
  if (v instanceof Date) return new Date(v.getTime())
  if (Array.isArray(v)) return v.map(deepClone)
  if (typeof v === 'object') {
    const o = {}
    for (const k in v) o[k] = deepClone(v[k])
    return o
  }
  return v
}
function norm(v) {
  if (v instanceof Timestamp) return v.toMillis()
  if (v instanceof Date) return v.getTime()
  return v
}
function eq(a, b) {
  return norm(a) === norm(b)
}
function compareVals(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (x == null && y == null) return 0
  if (x == null) return -1
  if (y == null) return 1
  if (typeof x === 'number' && typeof y === 'number') return x - y
  return String(x).localeCompare(String(y))
}
function matchWhere(fieldVal, op, value) {
  switch (op) {
    case '==': return eq(fieldVal, value)
    case '!=': return !eq(fieldVal, value)
    case '>': return compareVals(fieldVal, value) > 0
    case '>=': return compareVals(fieldVal, value) >= 0
    case '<': return compareVals(fieldVal, value) < 0
    case '<=': return compareVals(fieldVal, value) <= 0
    case 'array-contains': return Array.isArray(fieldVal) && fieldVal.some((x) => eq(x, value))
    case 'array-contains-any': return Array.isArray(fieldVal) && Array.isArray(value) && fieldVal.some((x) => value.some((y) => eq(x, y)))
    case 'in': return Array.isArray(value) && value.some((x) => eq(x, fieldVal))
    case 'not-in': return Array.isArray(value) && !value.some((x) => eq(x, fieldVal))
    default: return true
  }
}
function applyTransforms(target, updates) {
  const out = {}
  for (const k in updates) {
    const v = updates[k]
    if (v && v.__transform === 'arrayUnion') {
      const cur = Array.isArray(target[k]) ? target[k].slice() : []
      v.values.forEach((val) => { if (!cur.some((x) => eq(x, val))) cur.push(val) })
      out[k] = cur
    } else if (v && v.__transform === 'arrayRemove') {
      const cur = Array.isArray(target[k]) ? target[k].slice() : []
      out[k] = cur.filter((x) => !v.values.some((val) => eq(x, val)))
    } else if (v && v.__transform === 'increment') {
      out[k] = (Number(target[k]) || 0) + v.by
    } else {
      out[k] = deepClone(v)
    }
  }
  return out
}

/* ─────────────────────────── persistence ─────────────────────────── */
function replacer(key, value) {
  const orig = this[key]
  if (orig instanceof Timestamp) return { __ts__: orig.seconds, __tns__: orig.nanoseconds }
  if (orig instanceof Date) return { __date__: orig.toISOString() }
  return value
}
function reviver(key, value) {
  if (value && typeof value === 'object' && value.__ts__ !== undefined) return new Timestamp(value.__ts__, value.__tns__ || 0)
  if (value && typeof value === 'object' && value.__date__ !== undefined) return new Date(value.__date__)
  return value
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw, reviver)
  } catch {
    return null
  }
}
function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state, replacer))
  } catch (e) {
    console.warn('mock db persist failed', e)
  }
}
function seedState() {
  const seed = buildSeed(Timestamp)
  const collections = {}
  for (const [name, rows] of Object.entries(seed)) {
    collections[name] = {}
    ;(rows || []).forEach((row) => {
      const { id, ...rest } = row
      collections[name][id || genId()] = rest
    })
  }
  return { collections }
}

let state = load() || seedState()
save()

function ensure(path) {
  if (!state.collections[path]) state.collections[path] = {}
  return state.collections[path]
}
function persist() {
  save()
}

/* ─────────────────────────── listeners ─────────────────────────── */
const subs = new Set()
function notify(path) {
  subs.forEach((s) => {
    if (s.path === path) {
      try {
        s.emit()
      } catch (e) {
        console.error('snapshot emit error', e)
      }
    }
  })
}

/* ─────────────────────────── refs / query builders ─────────────────────────── */
export function getFirestore() {
  return { __mockDb: true }
}
export function connectFirestoreEmulator() {}
export async function enableNetwork() {}
export async function disableNetwork() {}

export function collection(_db, path) {
  return { type: 'collection', path }
}
export function doc(a, b, c) {
  // doc(db, path, id?) | doc(collectionRef, id?) | doc(collectionRef)
  if (a && a.type === 'collection') return { type: 'doc', path: a.path, id: b || genId() }
  return { type: 'doc', path: b, id: c || genId() }
}
export function query(collRef, ...constraints) {
  return { type: 'query', path: collRef.path, constraints }
}
export function where(field, op, value) {
  return { __c: 'where', field, op, value }
}
export function orderBy(field, dir = 'asc') {
  return { __c: 'orderBy', field, dir }
}
export function limit(n) {
  return { __c: 'limit', n }
}
export function startAfter(...args) {
  return { __c: 'startAfter', args }
}

/* ─────────────────────────── snapshots ─────────────────────────── */
function makeDocSnap(path, id) {
  const data = state.collections[path] ? state.collections[path][id] : undefined
  return {
    id,
    ref: { type: 'doc', path, id },
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : deepClone(data)),
    get: (f) => (data ? deepClone(data[f]) : undefined),
  }
}
function rowsFor(target) {
  const path = target.path
  const coll = state.collections[path] || {}
  let rows = Object.entries(coll).map(([id, data]) => ({ id, data }))
  const constraints = target.constraints || []
  constraints
    .filter((c) => c.__c === 'where')
    .forEach((w) => {
      rows = rows.filter((r) => matchWhere(r.data[w.field], w.op, w.value))
    })
  const ob = constraints.find((c) => c.__c === 'orderBy')
  if (ob) rows.sort((a, b) => compareVals(a.data[ob.field], b.data[ob.field]) * (ob.dir === 'desc' ? -1 : 1))
  const sa = constraints.find((c) => c.__c === 'startAfter')
  if (sa && ob) {
    const cursor = sa.args[0]
    const cv = cursor && typeof cursor.data === 'function' ? cursor.data()[ob.field] : cursor
    const idx = rows.findIndex((r) => compareVals(r.data[ob.field], cv) > 0)
    if (idx >= 0) rows = rows.slice(idx)
  }
  const lim = constraints.find((c) => c.__c === 'limit')
  if (lim) rows = rows.slice(0, lim.n)
  return rows
}
function makeQuerySnap(target) {
  const rows = rowsFor(target)
  const docs = rows.map((r) => ({
    id: r.id,
    ref: { type: 'doc', path: target.path, id: r.id },
    exists: () => true,
    data: () => deepClone(r.data),
    get: (f) => deepClone(r.data[f]),
  }))
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) }
}
function asQueryTarget(target) {
  return target.type === 'query' ? target : { type: 'query', path: target.path, constraints: [] }
}

/* ─────────────────────────── reads ─────────────────────────── */
export async function getDoc(ref) {
  return makeDocSnap(ref.path, ref.id)
}
export async function getDocs(target) {
  return makeQuerySnap(asQueryTarget(target))
}
export function onSnapshot(target, onNext, onError) {
  let path
  let emit
  if (target.type === 'doc') {
    path = target.path
    emit = () => onNext(makeDocSnap(target.path, target.id))
  } else {
    const t = asQueryTarget(target)
    path = t.path
    emit = () => onNext(makeQuerySnap(t))
  }
  const sub = { path, emit }
  subs.add(sub)
  Promise.resolve().then(() => {
    try {
      emit()
    } catch (e) {
      if (onError) onError(e)
      else console.error(e)
    }
  })
  return () => subs.delete(sub)
}

/* ─────────────────────────── writes ─────────────────────────── */
export async function addDoc(collRef, data) {
  const id = genId()
  ensure(collRef.path)[id] = deepClone(data)
  persist()
  notify(collRef.path)
  return { type: 'doc', path: collRef.path, id }
}
export async function setDoc(ref, data, opts) {
  const coll = ensure(ref.path)
  coll[ref.id] = opts && opts.merge ? { ...(coll[ref.id] || {}), ...deepClone(data) } : deepClone(data)
  persist()
  notify(ref.path)
}
export async function updateDoc(ref, updates) {
  const coll = ensure(ref.path)
  if (!coll[ref.id]) coll[ref.id] = {}
  Object.assign(coll[ref.id], applyTransforms(coll[ref.id], updates))
  persist()
  notify(ref.path)
}
export async function deleteDoc(ref) {
  const coll = state.collections[ref.path]
  if (coll && coll[ref.id]) {
    delete coll[ref.id]
    persist()
    notify(ref.path)
  }
}
export function writeBatch() {
  const ops = []
  const affected = new Set()
  return {
    set(ref, data, opts) {
      ops.push(() => {
        const coll = ensure(ref.path)
        coll[ref.id] = opts && opts.merge ? { ...(coll[ref.id] || {}), ...deepClone(data) } : deepClone(data)
        affected.add(ref.path)
      })
      return this
    },
    update(ref, updates) {
      ops.push(() => {
        const coll = ensure(ref.path)
        if (!coll[ref.id]) coll[ref.id] = {}
        Object.assign(coll[ref.id], applyTransforms(coll[ref.id], updates))
        affected.add(ref.path)
      })
      return this
    },
    delete(ref) {
      ops.push(() => {
        const coll = state.collections[ref.path]
        if (coll) delete coll[ref.id]
        affected.add(ref.path)
      })
      return this
    },
    async commit() {
      ops.forEach((op) => op())
      persist()
      affected.forEach((p) => notify(p))
    },
  }
}
export async function runTransaction(_db, updateFn) {
  const tx = {
    async get(ref) {
      return makeDocSnap(ref.path, ref.id)
    },
    set(ref, data, opts) {
      const coll = ensure(ref.path)
      coll[ref.id] = opts && opts.merge ? { ...(coll[ref.id] || {}), ...deepClone(data) } : deepClone(data)
    },
    update(ref, updates) {
      const coll = ensure(ref.path)
      if (!coll[ref.id]) coll[ref.id] = {}
      Object.assign(coll[ref.id], applyTransforms(coll[ref.id], updates))
    },
    delete(ref) {
      const coll = state.collections[ref.path]
      if (coll) delete coll[ref.id]
    },
  }
  const result = await updateFn(tx)
  persist()
  Object.keys(state.collections).forEach(notify)
  return result
}

/* ─────────────────────────── dev helper ─────────────────────────── */
if (typeof window !== 'undefined') {
  window.__mnaMockReset = () => {
    localStorage.removeItem(LS_KEY)
    location.reload()
  }
}
