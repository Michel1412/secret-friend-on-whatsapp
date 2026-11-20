import type { RevealedPair } from '../../shared/types'

function save(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(payload: unknown) {
  save('quebra-de-sigilo.json', JSON.stringify(payload, null, 2), 'application/json')
}

function cell(value: string) {
  if (/[;"\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function downloadCsv(pares: RevealedPair[]) {
  const header = ['Nome', 'Telefone', 'Nome sorteado', 'Telefone sorteado']
  const lines = pares.map((pair) =>
    [pair.nome, pair.telefone, pair.sorteado, pair.telefoneSorteado].map(cell).join(';'),
  )
  save('quebra-de-sigilo.csv', `\uFEFF${header.join(';')}\n${lines.join('\n')}\n`, 'text/csv;charset=utf-8')
}
