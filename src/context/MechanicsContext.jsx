import { createContext, useContext, useEffect, useState } from 'react'
import { db } from '../firebaseConfig'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'

/**
 * Lightweight mechanics list — replaces the old HR/EmployeeContext dependency.
 * Backed by the Firestore `mechanics` collection: { name, active, defaultCommissionType, defaultCommissionValue }.
 * Robust to legacy/external docs that store the name under a different field.
 */
const MechanicsContext = createContext()

export const useMechanics = () => {
  const ctx = useContext(MechanicsContext)
  if (!ctx) throw new Error('useMechanics must be used within a MechanicsProvider')
  return ctx
}

const displayName = (x) =>
  x.name || x.fullName || [x.firstName, x.lastName].filter(Boolean).join(' ').trim() || 'Unnamed'

export function MechanicsProvider({ children }) {
  const [mechanics, setMechanics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'mechanics'),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const data = d.data()
            return { id: d.id, ...data, name: displayName(data) }
          })
          .sort((a, b) => a.name.localeCompare(b.name))
        setMechanics(list)
        setLoading(false)
      },
      (err) => {
        console.error('mechanics listener error:', err)
        setError(err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  const addMechanic = (data) =>
    addDoc(collection(db, 'mechanics'), {
      name: (data.name || '').trim(),
      active: data.active !== false,
      defaultCommissionType: data.defaultCommissionType || 'percentage',
      defaultCommissionValue: Number(data.defaultCommissionValue) || 0,
      createdAt: new Date().toISOString(),
    })

  const updateMechanic = (id, updates) => updateDoc(doc(db, 'mechanics', id), updates)
  const removeMechanic = (id) => deleteDoc(doc(db, 'mechanics', id))

  const activeMechanics = mechanics.filter((m) => m.active !== false)

  return (
    <MechanicsContext.Provider
      value={{ mechanics, activeMechanics, loading, error, addMechanic, updateMechanic, removeMechanic }}
    >
      {children}
    </MechanicsContext.Provider>
  )
}

export default MechanicsContext
