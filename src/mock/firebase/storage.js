// Mock of firebase/storage — the app stores images as base64 in Firestore docs,
// so Storage is only initialized, never used for uploads. These are safe stubs.
export function getStorage() {
  return { __mockStorage: true }
}
export function ref(_storage, path) {
  return { path: path || '' }
}
export async function uploadBytes() {
  return { ref: {}, metadata: {} }
}
export async function getDownloadURL() {
  return ''
}
export default { getStorage, ref, uploadBytes, getDownloadURL }
