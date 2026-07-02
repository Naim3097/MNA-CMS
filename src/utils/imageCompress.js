/**
 * Shared image compression pipeline for inventory forms.
 * Resizes on a canvas, encodes to JPEG at a quality level, and caps the
 * resulting data-URL size so it stays well under Firestore's 1MB field limit.
 *
 * Both AddPartForm and EditPartModal use this so uploads are consistently
 * compressed (previously EditPartModal stored the raw, uncompressed data URL).
 */

// Mobile gets smaller dimensions / harder compression for speed + payload size.
const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768

const defaults = () => ({
  maxDimension: isMobile() ? 400 : 600,
  quality: isMobile() ? 0.6 : 0.8,
  // Data-URL length cap (chars). ~400KB mobile / ~600KB desktop keeps us
  // comfortably below the 1MB Firestore document field limit.
  sizeLimit: isMobile() ? 400000 : 600000,
  // Fallback quality used for a single retry when the first pass is too big.
  fallbackQuality: 0.4,
})

/**
 * Draw an <img> onto a canvas resized to fit within maxDimension, then export
 * as a compressed JPEG data URL. Retries once at a lower quality if needed.
 * @param {HTMLImageElement} img - a fully-loaded image element
 * @param {object} [opts]
 * @returns {string} compressed JPEG data URL
 * @throws {Error} if it cannot be compressed under the size limit
 */
function compressLoadedImage(img, opts = {}) {
  const { maxDimension, quality, sizeLimit, fallbackQuality } = { ...defaults(), ...opts }

  let { width, height } = img
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = (height * maxDimension) / width
      width = maxDimension
    } else {
      width = (width * maxDimension) / height
      height = maxDimension
    }
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = width
  canvas.height = height
  ctx.drawImage(img, 0, 0, width, height)

  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  if (dataUrl.length > sizeLimit) {
    // One more pass at a harder compression setting.
    const smaller = canvas.toDataURL('image/jpeg', fallbackQuality)
    if (smaller.length > sizeLimit) {
      throw new Error('Image is too large. Please use a smaller image.')
    }
    dataUrl = smaller
  }
  return dataUrl
}

/**
 * Compress a File (from a file input) into a compressed JPEG data URL.
 * Does NOT do the 5MB / type pre-check — callers keep that so they can show
 * their own messaging. Resolves to a data URL string.
 * @param {File} file
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
export function compressImage(file, opts = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not load the selected image.'))
      img.onload = () => {
        // Defer a tick so the UI can paint any "processing" state first.
        setTimeout(() => {
          try {
            resolve(compressLoadedImage(img, opts))
          } catch (err) {
            reject(err)
          }
        }, 50)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Compress an image referenced by URL into a compressed JPEG data URL.
 * The remote image must be CORS-readable for the canvas export to succeed.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
export function compressImageUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No image URL provided.'))
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => reject(new Error('Could not load image from URL.'))
    img.onload = () => {
      try {
        resolve(compressLoadedImage(img, opts))
      } catch (err) {
        reject(err)
      }
    }
    img.src = url
  })
}
