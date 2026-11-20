export type AccountRef = {
  phone?: string | null
  jid?: string | null
  lid?: string | null
}

function digits(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '')
}

/** Phone-number forms of the same Brazilian mobile, with and without the 9th digit. */
export function phoneVariants(input: string): Set<string> {
  const raw = digits(input)
  const variants = new Set<string>()
  if (!raw) return variants
  const withCountry = raw.startsWith('55') ? raw : `55${raw}`
  variants.add(withCountry)
  if (!withCountry.startsWith('55')) return variants
  const ddd = withCountry.slice(2, 4)
  const subscriber = withCountry.slice(4)
  if (subscriber.length === 9 && subscriber.startsWith('9')) {
    variants.add(`55${ddd}${subscriber.slice(1)}`)
  } else if (subscriber.length === 8) {
    variants.add(`55${ddd}9${subscriber}`)
  }
  return variants
}

export function sameWhatsAppNumber(left: string, right: string): boolean {
  const a = phoneVariants(left)
  const b = phoneVariants(right)
  if (a.size === 0 || b.size === 0) return false
  for (const item of a) {
    if (b.has(item)) return true
  }
  return false
}

function lidUser(value: string | null | undefined): string | null {
  if (!value || !value.toLowerCase().includes('@lid')) return null
  const user = value.split('@')[0]?.split(':')[0]?.trim()
  return user ? user : null
}

/** Digits of a phone or a phone JID. LID values are ignored so they are not compared as numbers. */
function phoneCandidate(value: string | null | undefined): string | null {
  if (!value || value.toLowerCase().includes('@lid')) return null
  const user = value.includes('@') ? (value.split('@')[0]?.split(':')[0] ?? '') : value
  const normalized = digits(user)
  return normalized || null
}

/** Same WhatsApp account: phone (including the BR 9), PN jid, or LID. */
export function sameAccount(left: AccountRef, right: AccountRef): boolean {
  const leftLid = lidUser(left.lid) ?? lidUser(left.jid)
  const rightLid = lidUser(right.lid) ?? lidUser(right.jid)
  if (leftLid && rightLid && leftLid === rightLid) return true

  const leftPhones = [phoneCandidate(left.phone), phoneCandidate(left.jid)].filter((value): value is string => Boolean(value))
  const rightPhones = [phoneCandidate(right.phone), phoneCandidate(right.jid)].filter((value): value is string => Boolean(value))
  for (const a of leftPhones) {
    for (const b of rightPhones) {
      if (sameWhatsAppNumber(a, b)) return true
    }
  }
  return false
}
