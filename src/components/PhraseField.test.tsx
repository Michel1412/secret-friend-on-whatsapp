/** @vitest-environment happy-dom */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PhraseField } from './PhraseField'

function Harness({ onBlocked = () => undefined }: { onBlocked?: () => void }) {
  const [value, setValue] = useState('')
  return <PhraseField value={value} onChange={setValue} onBlocked={onBlocked} />
}

describe('campo da frase', () => {
  it('aceita digitação e bloqueia colar, soltar e o menu de contexto', async () => {
    const user = userEvent.setup()
    const onBlocked = vi.fn()
    render(<Harness onBlocked={onBlocked} />)
    const input = screen.getByLabelText('Frase de confirmação')

    await user.type(input, 'quero')
    expect((input as HTMLInputElement).value).toBe('quero')

    expect(fireEvent.paste(input)).toBe(false)
    expect(fireEvent.drop(input)).toBe(false)
    expect(fireEvent.contextMenu(input)).toBe(false)
    expect(fireEvent.keyDown(input, { key: 'v', ctrlKey: true })).toBe(false)
    expect(fireEvent.keyDown(input, { key: 'Insert', shiftKey: true })).toBe(false)
    expect(onBlocked).toHaveBeenCalled()
    expect((input as HTMLInputElement).value).toBe('quero')
  })
})
