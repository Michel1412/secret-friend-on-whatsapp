import * as Dialog from '@radix-ui/react-dialog'
import { useId, type ReactNode } from 'react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  wide?: boolean
  children: ReactNode
}

export function Modal({ open, onOpenChange, title, description, wide = false, children }: Props) {
  const descriptionId = useId()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className={wide ? 'modal wide' : 'modal'} aria-describedby={description ? descriptionId : undefined}>
          <Dialog.Close className="modal-x" aria-label="Fechar">
            ×
          </Dialog.Close>
          <Dialog.Title className="modal-title serif">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description id={descriptionId} className="modal-desc">
              {description}
            </Dialog.Description>
          ) : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
