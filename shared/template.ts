export const MENSAGEM_PADRAO =
  'Oi! No amigo secreto você tirou: {{sorteado}}. Guarda segredo 🤫'

const VARIABLE = /\{\{\s*(sorteado|amigo)\s*\}\}/i

export function templateHasVariable(template: string): boolean {
  return VARIABLE.test(template)
}

export function fillTemplate(template: string, sorteado: string): string {
  if (!templateHasVariable(template)) {
    throw new Error('A mensagem precisa ter {{sorteado}} ou {{amigo}}.')
  }
  return template.replace(/\{\{\s*(sorteado|amigo)\s*\}\}/gi, () => sorteado)
}
