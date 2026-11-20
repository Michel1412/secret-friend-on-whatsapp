type Props = {
  value: string
  onChange: (value: string) => void
  onBlocked: () => void
  disabled?: boolean
}

function blockPaste(event: { preventDefault: () => void }, onBlocked: () => void) {
  event.preventDefault()
  onBlocked()
}

export function PhraseField({ value, onChange, onBlocked, disabled }: Props) {
  return (
    <input
      className="field"
      value={value}
      disabled={disabled}
      aria-label="Frase de confirmação"
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      name="quebra-sigilo-frase"
      data-1p-ignore="true"
      data-lpignore="true"
      onChange={(event) => onChange(event.target.value)}
      onPaste={(event) => blockPaste(event, onBlocked)}
      onDrop={(event) => blockPaste(event, onBlocked)}
      onDragOver={(event) => event.preventDefault()}
      onContextMenu={(event) => blockPaste(event, onBlocked)}
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const pasteKey =
          ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') ||
          (event.shiftKey && event.key === 'Insert')
        if (pasteKey) blockPaste(event, onBlocked)
      }}
      onBeforeInput={(event) => {
        const inputType = (event.nativeEvent as InputEvent).inputType
        if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
          blockPaste(event, onBlocked)
        }
      }}
    />
  )
}
