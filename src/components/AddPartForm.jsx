import { useState } from 'react'
import { usePartsContext } from '../context/PartsContext'
import { ResponsiveModal } from './ui'
import { compressImage, compressImageUrl } from '../utils/imageCompress'

const emptyForm = {
  kodProduk: '',
  namaProduk: '',
  harga: '',
  supplier: '',
  gambar: '',
  specification: '',
  unitStock: '',
}

function AddPartForm({ onClose }) {
  const { addPart } = usePartsContext()
  const [formData, setFormData] = useState(emptyForm)
  const [selectedFile, setSelectedFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessingImage, setIsProcessingImage] = useState(false)

  const validateForm = () => {
    const newErrors = {}
    if (!formData.kodProduk.trim()) newErrors.kodProduk = 'Product code is required'
    if (!formData.namaProduk.trim()) newErrors.namaProduk = 'Product name is required'
    if (!formData.harga || parseFloat(formData.harga) <= 0) newErrors.harga = 'Valid price is required'
    if (!formData.supplier.trim()) newErrors.supplier = 'Supplier is required'
    if (!formData.unitStock || parseInt(formData.unitStock) < 0) newErrors.unitStock = 'Valid stock count is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      await addPart(formData)
      onClose()
    } catch (error) {
      // Only surface real errors, not offline/timeout (part may be saved locally).
      if (!error.message?.includes('timeout') && !error.message?.includes('offline')) {
        alert(`Error adding part: ${error.message || 'Please try again.'}`)
      }
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return
    }

    setSelectedFile(file)
    setIsProcessingImage(true)
    try {
      const compressed = await compressImage(file)
      setImagePreview(compressed)
      setFormData((prev) => ({ ...prev, gambar: compressed }))
    } catch (error) {
      alert(error.message || 'Error processing image. Please try a different image.')
      clearImage()
    } finally {
      setIsProcessingImage(false)
    }
  }

  const handleUrlChange = async (url) => {
    if (selectedFile) return
    handleChange('gambar', url)
    setImagePreview('')
    if (url && url.startsWith('http')) {
      try {
        const compressed = await compressImageUrl(url)
        setImagePreview(compressed)
        setFormData((prev) => ({ ...prev, gambar: compressed }))
      } catch {
        // Leave the raw URL in place if it can't be read/compressed (e.g. CORS).
      }
    }
  }

  const clearImage = () => {
    setSelectedFile(null)
    setImagePreview('')
    setIsProcessingImage(false)
    setFormData((prev) => ({ ...prev, gambar: '' }))
    const fileInput = document.getElementById('image-upload')
    if (fileInput) fileInput.value = ''
  }

  const previewSrc = imagePreview || formData.gambar

  return (
    <ResponsiveModal
      isOpen={true}
      onClose={onClose}
      title="Add part"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" form="add-part-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Adding…' : 'Add part'}
          </button>
        </>
      }
    >
      <form id="add-part-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Product code *</label>
            <input
              type="text"
              value={formData.kodProduk}
              onChange={(e) => handleChange('kodProduk', e.target.value)}
              className={`input ${errors.kodProduk ? 'border-danger' : ''}`}
              placeholder="e.g. BRK001"
            />
            {errors.kodProduk && <p className="field-hint text-danger">{errors.kodProduk}</p>}
          </div>

          <div>
            <label className="field-label">Price (RM) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={formData.harga}
              onChange={(e) => handleChange('harga', e.target.value)}
              className={`input nums ${errors.harga ? 'border-danger' : ''}`}
              placeholder="0.00"
            />
            {errors.harga && <p className="field-hint text-danger">{errors.harga}</p>}
          </div>
        </div>

        <div>
          <label className="field-label">Product name *</label>
          <input
            type="text"
            value={formData.namaProduk}
            onChange={(e) => handleChange('namaProduk', e.target.value)}
            className={`input ${errors.namaProduk ? 'border-danger' : ''}`}
            placeholder="e.g. Brake Pads - Front"
          />
          {errors.namaProduk && <p className="field-hint text-danger">{errors.namaProduk}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Supplier *</label>
            <input
              type="text"
              value={formData.supplier}
              onChange={(e) => handleChange('supplier', e.target.value)}
              className={`input ${errors.supplier ? 'border-danger' : ''}`}
              placeholder="e.g. AutoParts Co."
            />
            {errors.supplier && <p className="field-hint text-danger">{errors.supplier}</p>}
          </div>

          <div>
            <label className="field-label">Stock quantity *</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={formData.unitStock}
              onChange={(e) => handleChange('unitStock', e.target.value)}
              className={`input nums ${errors.unitStock ? 'border-danger' : ''}`}
              placeholder="0"
            />
            {errors.unitStock && <p className="field-hint text-danger">{errors.unitStock}</p>}
          </div>
        </div>

        <div>
          <label className="field-label">
            Product image <span className="text-muted font-normal">(optional)</span>
          </label>

          {previewSrc && (
            <div className="mb-3">
              <div className="relative inline-block">
                <img
                  src={previewSrc}
                  alt="Product preview"
                  className="w-24 h-24 object-cover rounded-xl border border-line"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    e.target.nextSibling.style.display = 'flex'
                  }}
                />
                <div
                  className="w-24 h-24 rounded-xl border border-line bg-bg items-center justify-center text-muted text-xs"
                  style={{ display: 'none' }}
                >
                  Invalid image
                </div>
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute -top-2 -right-2 pill pill-ink"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {isProcessingImage && (
            <p className="field-hint text-ink mb-3">Processing image…</p>
          )}

          <div className="space-y-3">
            <div>
              <input
                type="file"
                id="image-upload"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <label
                htmlFor="image-upload"
                className={`btn-secondary btn-sm inline-flex ${isProcessingImage ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {isProcessingImage ? 'Processing…' : 'Upload from device'}
              </label>
              <p className="field-hint">Max 5MB. Auto-compressed for fast upload.</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 divider" />
              <span className="text-xs text-muted">OR</span>
              <div className="flex-1 divider" />
            </div>

            <div>
              <input
                type="url"
                value={selectedFile ? '' : formData.gambar}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={!!selectedFile}
                className={`input ${selectedFile ? 'opacity-60' : ''}`}
                placeholder="https://example.com/image.jpg"
              />
              <p className="field-hint">Paste an image URL (compressed automatically when possible).</p>
            </div>
          </div>
        </div>

        <div>
          <label className="field-label">
            Specifications <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={formData.specification}
            onChange={(e) => handleChange('specification', e.target.value)}
            className="input textarea"
            placeholder="Technical details, compatibility, dimensions, etc."
          />
        </div>
      </form>
    </ResponsiveModal>
  )
}

export default AddPartForm
