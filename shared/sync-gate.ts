export const LIMITE_TENTATIVAS_APAGAR = 3

/** Eight digits, including leading zeros. `rng` returns a number in [0, 1). */
export function codigoTeste(rng: () => number = Math.random): string {
  let code = ''
  for (let index = 0; index < 8; index += 1) {
    code += Math.floor(rng() * 10).toString()
  }
  return code
}

export function mensagemTeste(codigo: string): string {
  return `Teste Papelzinho #${codigo}`
}

/** Send and "Testar apagar" stay locked until WhatsApp Web is ready. */
export function envioLiberado(verificado: boolean): boolean {
  return verificado
}

/** One failed delete. After the limit, stop retrying. */
export function registrarFalhaApagar(
  tentativasAtuais: number,
  limite = LIMITE_TENTATIVAS_APAGAR,
): { tentativas: number; esgotou: boolean } {
  const tentativas = tentativasAtuais + 1
  return { tentativas, esgotou: tentativas >= limite }
}

export function mascararDestino(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return '••••'
  return `••••${digits.slice(-4)}`
}
