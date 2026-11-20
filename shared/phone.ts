const VALID_DDD = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '64', '63', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; error: string }

/**
 * Accepts common Brazilian mobile shapes and stores E.164 with country code 55.
 * Landlines are rejected: WhatsApp needs a mobile with the leading 9.
 */
export function normalizeBrazilPhone(input: string): PhoneResult {
  let digits = input.replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return { ok: false, error: 'Informe o WhatsApp com DDD.' }

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    // already includes the country code
  } else if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  } else if (digits.startsWith('55')) {
    return { ok: false, error: 'Número incompleto. Use DDD + celular, como (11) 98888-7777.' }
  } else {
    return { ok: false, error: 'Número incompleto. Use DDD + celular, como (11) 98888-7777.' }
  }

  const ddd = digits.slice(2, 4)
  const subscriber = digits.slice(4)
  if (!VALID_DDD.has(ddd)) {
    return { ok: false, error: `DDD ${ddd} não é válido.` }
  }
  if (subscriber.length === 8) {
    return { ok: false, error: 'Esse número parece fixo. O WhatsApp pede celular, com o 9.' }
  }
  if (subscriber.length !== 9 || !subscriber.startsWith('9')) {
    return { ok: false, error: 'Celular precisa ter o 9 depois do DDD. Ex.: (11) 98888-7777.' }
  }
  return { ok: true, e164: `+${digits}` }
}

export function formatBrazilPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4)
    const subscriber = digits.slice(4)
    return `+55 ${ddd} ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
  }
  return e164.startsWith('+') ? e164 : `+${digits}`
}

export function phoneDigits(e164: string): string {
  return e164.replace(/\D/g, '')
}
