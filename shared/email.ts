/** Login is only a label for whose data this browser is using. The inbox is not checked. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

export function emailAceito(input: string): string | null {
  const email = normalizeEmail(input)
  if (email.length < 3 || email.length > 200) return null
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null
  return email
}
