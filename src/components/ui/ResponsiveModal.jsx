import { useEffect, useRef } from 'react'

/**
 * ResponsiveModal — bottom-sheet on phones, centered dialog from sm up.
 * 2026 styling, no icons (text "Close"). Handles ESC, backdrop click, scroll lock.
 */
const sizeMap = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  '2xl': 'sm:max-w-6xl',
  full: 'sm:max-w-[95vw]',
}

const ResponsiveModal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  className = '',
  bodyClassName = '',
}) => {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const closeOnEscRef = useRef(closeOnEsc)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { closeOnEscRef.current = closeOnEsc }, [closeOnEsc])

  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e) => {
      if (closeOnEscRef.current && e.key === 'Escape') onCloseRef.current?.()
    }
    document.addEventListener('keydown', handleKey)
    const t = setTimeout(() => {
      const focusable = dialogRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusable?.focus()
    }, 50)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', handleKey)
      clearTimeout(t)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay animate-fade-in"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={`
          bg-surface w-full shadow-pop flex flex-col
          rounded-t-2xl sm:rounded-2xl
          max-h-[94dvh] sm:max-h-[90vh]
          animate-slide-up sm:animate-scale-in
          ${sizeMap[size] || sizeMap.md}
          ${className}
        `}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-line" />
        </div>

        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-line shrink-0">
            <h3 id="modal-title" className="text-lg font-semibold tracking-tight text-ink truncate">
              {title}
            </h3>
            {!hideCloseButton && (
              <button
                onClick={onClose}
                className="text-sm font-medium text-muted hover:text-ink min-h-touch px-2 -mr-2 tap-clean"
                aria-label="Close"
              >
                Close
              </button>
            )}
          </div>
        )}

        <div className={`flex-1 overflow-y-auto touch-scroll px-4 sm:px-6 py-4 ${bodyClassName}`}>
          {children}
        </div>

        {footer && (
          <div
            className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-t border-line shrink-0 bg-surface"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default ResponsiveModal
