import './sequence.css'

type Props = {
  sequence: string[]
  highlightIndex?: number
  playerInput?: string[]
}

export default function SequenceDisplay({ sequence, highlightIndex = -1, playerInput = [] }: Props) {
  return (
    <div className="sequence-display">
      <h2 className="seq-title">Sequence</h2>
      <div className="sequence-list">
        {sequence.map((s, i) => {
          const filled = i < playerInput.length && playerInput[i] === s
          const wrong = i < playerInput.length && playerInput[i] !== s
          const classes = ['seq-item', i === highlightIndex ? 'highlight' : '', filled ? 'filled' : '', wrong ? 'wrong' : ''].join(' ')
          return (
            <div key={i} className={classes}>
              <div className="idx">{i + 1}</div>
              <div className="label">{s}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
