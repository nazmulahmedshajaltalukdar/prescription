import React, { PointerEvent, useEffect, useRef } from 'react'
import { Eraser } from 'lucide-react'

interface SignaturePadProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function SignaturePad({ value, onChange, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!value) return

    const image = new Image()
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height)
    image.src = value
  }, [value])

  const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * event.currentTarget.width,
      y: ((event.clientY - bounds.top) / bounds.height) * event.currentTarget.height,
    }
  }

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = getPoint(event)
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPointRef.current) return
    event.preventDefault()

    const canvas = event.currentTarget
    const context = canvas.getContext('2d')
    if (!context) return

    const point = getPoint(event)
    context.beginPath()
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    context.lineTo(point.x, point.y)
    context.strokeStyle = '#0f172a'
    context.lineWidth = 4
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke()
    lastPointRef.current = point
  }

  const finishDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    onChange(event.currentTarget.toDataURL('image/png'))
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    onChange('')
  }

  return (
    <div>
      <div className="signature-pad-wrap">
        <canvas
          ref={canvasRef}
          className={`signature-pad${disabled ? ' signature-pad-disabled' : ''}`}
          width={1200}
          height={240}
          aria-label="Draw clinician signature"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
        />
        {!value && <span className="signature-pad-hint">Draw signature here</span>}
      </div>
      <button type="button" className="action-button-secondary mt-2" onClick={clearSignature} disabled={disabled || !value}>
        <Eraser className="mr-1.5 h-4 w-4" /> Clear signature
      </button>
    </div>
  )
}