import { Lock } from 'lucide-react'
import { formatBrazilPhone } from '../../shared/phone'
import { validarPares } from '../../shared/sigilo'
import type { RevealedPair } from '../../shared/types'
import { downloadCsv, downloadJson } from '@/lib/download'
import { Button } from './ui/button'

type Props = {
  sorteioId: string
  criadoEm: string
  pares: RevealedPair[]
  onLock: () => void
}

function when(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function RevealPanel({ sorteioId, criadoEm, pares, onLock }: Props) {
  const check = validarPares(pares)
  const ok = check.semAutoSorteio && check.bijecao

  return (
    <section className="card" aria-labelledby="titulo-revelado">
      <p className="kicker">Sigilo aberto nesta tela</p>
      <h2 id="titulo-revelado">Quem tirou quem</h2>
      <p className="small muted">
        Sorteio de {when(criadoEm)}. Quando terminar a conferência, bloqueie de novo. Atualizar a página também esconde
        a lista.
      </p>
      <ul className="checks">
        <li>{ok ? '✓' : '!'} {check.total} pares</li>
        <li>{check.semAutoSorteio ? '✓' : '!'} Ninguém tirou a si mesmo</li>
        <li>{check.bijecao ? '✓' : '!'} Cada pessoa foi sorteada uma vez</li>
      </ul>
      <div className="table-wrap">
        <table className="reveal">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Tirou</th>
              <th>WhatsApp do sorteado</th>
            </tr>
          </thead>
          <tbody>
            {pares.map((pair) => (
              <tr key={`${pair.telefone}-${pair.telefoneSorteado}`}>
                <td>{pair.nome}</td>
                <td>{formatBrazilPhone(pair.telefone)}</td>
                <td>{pair.sorteado}</td>
                <td>{formatBrazilPhone(pair.telefoneSorteado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="btn-row" style={{ marginTop: '0.9rem' }}>
        <Button
          variant="outline"
          onClick={() =>
            downloadJson({
              sorteio: sorteioId,
              criadoEm,
              pares,
            })
          }
        >
          Exportar JSON
        </Button>
        <Button variant="outline" onClick={() => downloadCsv(pares)}>
          Exportar CSV
        </Button>
        <Button variant="seal" onClick={onLock}>
          <Lock size={16} aria-hidden /> Bloquear
        </Button>
      </div>
    </section>
  )
}
