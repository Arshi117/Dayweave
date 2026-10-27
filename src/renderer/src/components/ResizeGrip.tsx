import { useRef, type PointerEvent } from 'react'
import type { ResizeTarget, ResizeEdge } from '../../../shared/focus-window-layout'

export function ResizeGrip({ target, edge }: { target: ResizeTarget; edge: ResizeEdge }) {
  const pointer = useRef<number | null>(null)
  const label = target === 'strip' ? '拖动调整长条长度' : edge.includes('-') ? '拖动调整日历大小' : edge === 'top' || edge === 'bottom' ? '拖动调整日历高度' : '拖动调整日历宽度'
  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (pointer.current !== event.pointerId) return
    pointer.current = null
    window.focusControls?.moveDimensionResize()
    window.focusControls?.endDimensionResize()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <button type="button" className={'dimension-grip grip-' + edge} aria-label={label} title={label + '；方向键微调'}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault(); event.stopPropagation()
      pointer.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      window.focusControls?.beginDimensionResize(target, edge)
    }}
    onPointerMove={event => { if (pointer.current === event.pointerId) window.focusControls?.moveDimensionResize() }}
    onPointerUp={finish} onPointerCancel={finish}
    onLostPointerCapture={event => { if (pointer.current === event.pointerId) { pointer.current = null; window.focusControls?.endDimensionResize() } }}
    onKeyDown={event => {
      const horizontal = edge.includes('left') || edge.includes('right')
      const vertical = edge.includes('top') || edge.includes('bottom')
      const dx = horizontal && event.key === 'ArrowLeft' ? -20 : horizontal && event.key === 'ArrowRight' ? 20 : 0
      const dy = vertical && event.key === 'ArrowUp' ? -20 : vertical && event.key === 'ArrowDown' ? 20 : 0
      if (!dx && !dy) return
      event.preventDefault(); event.stopPropagation()
      window.focusControls?.stepDimensionResize(target, edge, dx, dy)
    }}><span aria-hidden="true" /></button>
}
