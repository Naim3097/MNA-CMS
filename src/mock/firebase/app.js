// Mock of firebase/app — active when VITE_USE_MOCK !== 'false' (see vite.config.js).
export function initializeApp(config) {
  return { name: '[MOCK-APP]', options: config || {} }
}
export function getApp() {
  return { name: '[MOCK-APP]' }
}
export function getApps() {
  return [{ name: '[MOCK-APP]' }]
}
export default { initializeApp, getApp, getApps }
