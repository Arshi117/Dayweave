import { Check } from 'lucide-react'
import { APPEARANCES, type Appearance } from '../appearance'

export function AppearancePicker({ value, onChange }: { value: Appearance; onChange: (next: Appearance) => void }) {
  return <section className="appearance-picker" aria-label="外观风格">
    <h2>选一种喜欢的外观</h2>
    <p>切换后立即生效，下次打开仍会保留。</p>
    <div className="appearance-options" role="group" aria-label="选择外观风格">
      {APPEARANCES.map(option => <button key={option.id} type="button" className="appearance-option"
        data-preview={option.id} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
        <span className="appearance-swatch" aria-hidden="true"><i /><span /><b /></span>
        <span className="appearance-option-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
        <span className="appearance-check" aria-hidden="true">{value === option.id && <Check size={14} />}</span>
      </button>)}
    </div>
  </section>
}
