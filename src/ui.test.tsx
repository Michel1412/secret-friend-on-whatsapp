/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { impressaoDaLista } from '../shared/sigilo'
import type { ParticipantInput, PublicDraw } from '../shared/types'
import { App } from './App'
import { ConnectionCard } from './components/ConnectionCard'
import { ImportDialog } from './components/ImportDialog'
import { MessageCard } from './components/MessageCard'
import { ParticipantsCard } from './components/ParticipantsCard'
import { ProgressCard } from './components/ProgressCard'
import { RevealPanel } from './components/RevealPanel'
import { SigiloDialog } from './components/SigiloDialog'

const people: ParticipantInput[] = [
  { id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001' },
  { id: 'b', nome: 'Pessoa Beta', telefone: '+5521900000002' },
  { id: 'c', nome: 'Pessoa Gama', telefone: '+5511900000003' },
  { id: 'd', nome: 'Pessoa Delta', telefone: '+5511900000004' },
]

const draw: PublicDraw = {
  id: 'sorteio-teste',
  criadoEm: '2026-01-02T15:04:00.000Z',
  impressao: impressaoDaLista(people),
  participantes: [
    { id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001', status: 'apagado', detalhe: null, manter: false },
    { id: 'b', nome: 'Pessoa Beta', telefone: '+5521900000002', status: 'enviado', detalhe: 'Enviado, apagar não confirmado.', manter: false },
    { id: 'c', nome: 'Pessoa Gama', telefone: '+5511900000003', status: 'enviado', detalhe: 'Enviado para o próprio número, não apagado.', manter: true },
    { id: 'd', nome: 'Pessoa Delta', telefone: '+5511900000004', status: 'erro', detalhe: 'Falhou.', manter: false },
  ],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('interface', () => {
  it('entra com e-mail, mostra QR, Verificado, andamento e a quebra de sigilo', async () => {
    const user = userEvent.setup()
    let email: string | null = null
    let wa = {
      status: 'qr' as const,
      qrDataUrl: 'data:image/gif;base64,AAAA',
      phone: null,
      pushName: null,
      error: null,
      appStateReady: false,
      appStateReadyEm: null,
      testes: [] as { codigo: string; destino: string; em: string; envioOk: boolean; apagadoOk: boolean }[],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        if (url.endsWith('/api/sessao') && method === 'GET') return Response.json({ email })
        if (url.endsWith('/api/sessao') && method === 'POST') {
          email = String(body.email).trim().toLowerCase()
          return Response.json({ email })
        }
        if (url.endsWith('/api/sessao') && method === 'DELETE') {
          email = null
          return Response.json({ ok: true })
        }
        if (url.endsWith('/api/perfil') && method === 'GET') {
          return Response.json({ email, participantes: people, mensagem: 'Aviso {{sorteado}}', intervaloMs: 3000 })
        }
        if (url.endsWith('/api/perfil') && method === 'PUT') return Response.json({ email, ...body })
        if (url.endsWith('/api/whatsapp') && method === 'GET') return Response.json(wa)
        if (url.endsWith('/api/whatsapp/connect') && method === 'POST') return Response.json(wa)
        if (url.endsWith('/api/whatsapp/logout') && method === 'POST') {
          wa = { ...wa, status: 'disconnected', appStateReady: false, phone: null, pushName: null }
          return Response.json(wa)
        }
        if (url.endsWith('/api/enviar') && method === 'POST') {
          return Response.json({ envio: { ativo: true, feitos: 0, total: 1, erro: null }, sorteio: draw })
        }
        if (url.endsWith('/api/sorteio') && method === 'GET') {
          return Response.json({ sorteio: wa.appStateReady ? draw : null, envio: { ativo: false, feitos: 0, total: 0, erro: null } })
        }
        if (url.endsWith('/api/sorteio') && method === 'POST') return Response.json({ sorteio: draw })
        if (url.endsWith('/api/sigilo') && method === 'POST') {
          return Response.json({
            sorteioId: draw.id,
            criadoEm: draw.criadoEm,
            pares: people.map((person, index) => ({
              nome: person.nome,
              telefone: person.telefone,
              sorteado: people[(index + 1) % people.length]!.nome,
              telefoneSorteado: people[(index + 1) % people.length]!.telefone,
            })),
          })
        }
        return Response.json({ error: 'não mockado' }, { status: 500 })
      }),
    )

    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Qual é o seu e-mail?' })).toBeTruthy()
    await user.type(screen.getByLabelText('E-mail'), 'ada@exemplo.test')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('img', { name: 'QR Code para conectar o WhatsApp' })).toBeTruthy()
    expect(screen.getByText('Aguardando leitura')).toBeTruthy()
    expect(screen.getByText(/só para leitura/)).toBeTruthy()

    wa = {
      ...wa,
      status: 'connected',
      qrDataUrl: null,
      phone: '+5511900000001',
      pushName: 'Alfa',
      appStateReady: true,
      appStateReadyEm: '2026-01-02T15:00:00.000Z',
      testes: [
        { codigo: '00000001', destino: '••••0001', em: '2026-01-02T15:00:00.000Z', envioOk: true, apagadoOk: true },
        { codigo: '00000002', destino: '••••0002', em: '2026-01-02T15:05:00.000Z', envioOk: true, apagadoOk: false },
      ],
    }
    expect(await screen.findByText('Verificado', undefined, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('Apagado')).toBeTruthy()
    expect(screen.getByText('Enviado')).toBeTruthy()
    expect(screen.getByText('No seu número')).toBeTruthy()
    expect(screen.getByText('Erro')).toBeTruthy()
    expect(screen.getAllByText(/00000001/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/não confirmado/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Quebra de Sigilo' }))
    expect(screen.getByRole('heading', { name: 'Modal de proteção' })).toBeTruthy()
    expect(screen.getByText('quero quebrar o sigilo')).toBeTruthy()
    const phrase = screen.getByLabelText('Frase de confirmação')
    expect(fireEvent.paste(phrase)).toBe(false)
    await user.type(phrase, 'quero quebrar o sigilo')
    await user.click(screen.getByRole('button', { name: 'Confirmar e revelar' }))
    expect(await screen.findByRole('heading', { name: 'Quem tirou quem' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(screen.queryByRole('heading', { name: 'Quem tirou quem' })).toBe(null)

    await user.click(screen.getByRole('button', { name: 'Continuar envio' }))
    const sendDialog = screen.getByRole('dialog')
    expect(within(sendDialog).getByRole('heading', { name: 'Enviar agora?' })).toBeTruthy()
    await user.click(within(sendDialog).getByRole('button', { name: 'Enviar agora' }))

    await user.click(screen.getByRole('button', { name: 'Sortear de novo' }))
    const redrawDialog = screen.getByRole('dialog')
    await user.click(within(redrawDialog).getByRole('button', { name: 'Sortear de novo' }))

    await user.click(screen.getByRole('button', { name: 'Desconectar' }))
    const logoutDialog = screen.getByRole('dialog')
    await user.click(within(logoutDialog).getByRole('button', { name: 'Desconectar' }))

    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('heading', { name: 'Qual é o seu e-mail?' })).toBeTruthy()
  })

  it('importa planilha escolhendo a coluna e avisa modelo sem variável', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onChange = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir importação
          </button>
          <ImportDialog open={open} existing={[]} onOpenChange={setOpen} onApply={onApply} />
          <MessageCard
          message="sem marca"
          delay={3000}
          locked={false}
          frozen={false}
          peopleCount={2}
          hasDraw={false}
          onMessage={() => undefined}
          onDelay={() => undefined}
          onDraw={() => undefined}
          onAskRedraw={() => undefined}
        />
        <ParticipantsCard
          people={[]}
          message="Aviso {{sorteado}}"
          delay={3000}
          locked={false}
          frozen={false}
          onChange={onChange}
          onImportExtras={() => undefined}
        />
        </>
      )
    }
    render(<Harness />)
    expect((screen.getByRole('button', { name: 'Sortear' }) as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Nome'), 'Pessoa Gama')
    await user.type(screen.getByLabelText('Número de WhatsApp'), '11900000003')
    await user.click(screen.getByRole('button', { name: 'Adicionar pessoa' }))
    expect(onChange).toHaveBeenCalled()
    await user.type(screen.getByLabelText('Nome'), 'Pessoa Gama')
    await user.click(screen.getByRole('button', { name: 'Adicionar pessoa' }))
    expect(screen.getByRole('alert').textContent).toMatch(/WhatsApp|número|DDD|celular/i)
    await user.click(screen.getByRole('button', { name: 'Abrir importação' }))
    await user.type(screen.getByLabelText('Ou cole da planilha'), 'Nome\tTelefone\nPessoa Alfa\t11900000001\nPessoa Beta\t21900000002')
    await user.click(screen.getByRole('button', { name: 'Ler colagem' }))
    expect(screen.getByLabelText('Coluna do nome')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Coluna do telefone'), '1')
    await user.click(screen.getByRole('button', { name: 'Importar 2' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ nome: 'Pessoa Alfa', telefone: '+5511900000001' })]),
      'replace',
      undefined,
    )
    await user.click(screen.getByRole('button', { name: 'Abrir importação' }))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['Nome,Telefone\nPessoa Delta,11900000004\n'], 'lista.csv', { type: 'text/csv' }))
    expect(screen.getByRole('button', { name: /Importar/ })).toBeTruthy()
    await user.upload(input, new File([new Uint8Array(5_000_001)], 'grande.csv', { type: 'text/csv' }))
    expect(screen.getByRole('alert').textContent).toMatch(/grande/)
    await user.upload(
      input,
      new File([JSON.stringify({ participantes: [{ nome: 'Pessoa Delta', telefone: '11900000004' }], mensagem: 'Aviso {{sorteado}}' })], 'lista.json', {
        type: 'application/json',
      }),
    )
    expect(screen.getByRole('button', { name: /Importar/ })).toBeTruthy()
  })

  it('edita e remove uma pessoa da lista', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ParticipantsCard
        people={[{ id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001' }]}
        message="Aviso {{sorteado}}"
        delay={3000}
        locked={false}
        frozen={false}
        onChange={onChange}
        onImportExtras={() => undefined}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const nome = screen.getByLabelText('Nome de Pessoa Alfa')
    await user.clear(nome)
    await user.type(nome, 'Pessoa Beta')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(onChange).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Remover' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('button', { name: 'Exportar lista' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Exportar lista' }))
  })

  it('altera o modelo e dispara o teste de apagar', async () => {
    const user = userEvent.setup()
    const onMessage = vi.fn()
    const onDelay = vi.fn()
    const onTest = vi.fn()
    render(
      <>
        <MessageCard
          message="Aviso {{sorteado}}"
          delay={3000}
          locked={false}
          frozen={false}
          peopleCount={2}
          hasDraw={false}
          onMessage={onMessage}
          onDelay={onDelay}
          onDraw={() => undefined}
          onAskRedraw={() => undefined}
        />
        <ConnectionCard
          wa={{
            status: 'connected',
            qrDataUrl: null,
            phone: '+5511900000001',
            pushName: null,
            error: null,
            appStateReady: true,
            appStateReadyEm: '2026-01-02T15:00:00.000Z',
          }}
          busy={false}
          testing={false}
          verificado
          testSteps={null}
          codigoTeste={null}
          testes={[]}
          onConnect={() => undefined}
          onAskLogout={() => undefined}
          onTest={onTest}
        />
      </>,
    )
    await user.type(screen.getByLabelText('Texto'), '!')
    expect(onMessage).toHaveBeenCalled()
    await user.selectOptions(screen.getByLabelText('Pausa depois de cada pessoa'), '4000')
    expect(onDelay).toHaveBeenCalledWith(4000)
    await user.type(screen.getByPlaceholderText('Vazio usa o seu número'), '11900000009')
    await user.click(screen.getByRole('button', { name: 'Testar apagar' }))
    expect(onTest).toHaveBeenCalledWith('11900000009')
  })

  it('mostra o selo, o histórico e o vazio do envio', () => {
    render(
      <>
        <ConnectionCard
          wa={{
            status: 'connected',
            qrDataUrl: null,
            phone: '+5511900000001',
            pushName: 'Alfa',
            error: 'sessão recusada',
            appStateReady: false,
            appStateReadyEm: null,
          }}
          busy={false}
          testing={false}
          verificado={false}
          testSteps={[{ passo: 'envio', ok: false, detalhe: 'falhou' }]}
          codigoTeste="00000042"
          testes={[{ codigo: '00000042', destino: '••••0001', em: '2026-01-02T15:00:00.000Z', envioOk: false, apagadoOk: false }]}
          onConnect={() => undefined}
          onAskLogout={() => undefined}
          onTest={() => undefined}
        />
        <ProgressCard
          sorteio={null}
          envio={{ ativo: false, feitos: 0, total: 0, erro: null }}
          connected={false}
          mismatch={false}
          verificado={false}
          onAskSend={() => undefined}
          onAskSigilo={() => undefined}
        />
      </>,
    )
    expect(screen.getByText('Aguardando WhatsApp')).toBeTruthy()
    expect(screen.getAllByText(/00000042/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Depois do sorteio/)).toBeTruthy()
  })

  it('bloqueia colar no modal e exporta a revelação', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => undefined)
    const onLock = vi.fn()
    const dialogView = render(<SigiloDialog open onOpenChange={() => undefined} onConfirm={onConfirm} />)
    const dialog = screen.getByRole('dialog')
    const phrase = within(dialog).getByLabelText('Frase de confirmação')
    expect(fireEvent.paste(phrase)).toBe(false)
    await user.type(phrase, 'errado')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar e revelar' }))
    expect(onConfirm).toHaveBeenCalledWith('errado')
    dialogView.unmount()
    render(
      <RevealPanel
        sorteioId="sorteio-teste"
        criadoEm="2026-01-02T15:04:00.000Z"
        pares={[
          { nome: 'Pessoa Alfa', telefone: '+5511900000001', sorteado: 'Pessoa Beta', telefoneSorteado: '+5521900000002' },
          { nome: 'Pessoa Beta', telefone: '+5521900000002', sorteado: 'Pessoa Alfa', telefoneSorteado: '+5511900000001' },
        ]}
        onLock={onLock}
      />,
    )
    expect(document.body.textContent).toContain('Ninguém tirou a si mesmo')
    await user.click(screen.getByRole('button', { name: 'Exportar JSON' }))
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }))
    await user.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(onLock).toHaveBeenCalled()
  })
})
