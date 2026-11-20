import { cn } from '@/lib/utils'

type Props = {
  className?: string
  /** When set, the mark is announced. The header already names the app, so the default is decorative. */
  title?: string
}

export function GiftLogo({ className, title }: Props) {
  const labeled = Boolean(title)
  return (
    <svg
      className={cn('brand-mark', className)}
      viewBox="0 0 64 64"
      role={labeled ? 'img' : undefined}
      aria-hidden={labeled ? undefined : true}
      aria-label={labeled ? title : undefined}
    >
      <rect x="12" y="32" width="40" height="24" rx="3.5" fill="var(--gift)" />
      <rect x="8" y="22" width="48" height="12" rx="3" fill="var(--gift-lid)" />
      <rect x="28" y="22" width="8" height="34" fill="var(--gift-ribbon)" />
      <rect x="8" y="25" width="48" height="6" fill="var(--gift-ribbon)" />
      <path
        d="M31.2 20.4c-1.1-7.6-9.8-11.4-14.6-7.2-3.7 3.2-2.1 8.4 1.8 10.4 3.1 1.6 8.6.5 12.8-3.2z"
        fill="var(--gift-bow)"
      />
      <path
        d="M32.8 20.4c1.1-7.6 9.8-11.4 14.6-7.2 3.7 3.2 2.1 8.4-1.8 10.4-3.1 1.6-8.6.5-12.8-3.2z"
        fill="var(--gift-bow-deep)"
      />
      <circle cx="32" cy="20.2" r="4" fill="var(--gift)" />
      <circle cx="30.6" cy="18.9" r="1.15" fill="var(--gift-ribbon)" />
    </svg>
  )
}
