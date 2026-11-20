import { describe, expect, it, vi } from 'vitest'

vi.mock('xlsx', () => ({
  read: () => ({ SheetNames: [], Sheets: {} }),
  utils: {},
}))

import { readWorkbook } from './sheet'

describe('planilha vazia', () => {
  it('recusa um arquivo sem abas', () => {
    expect(() => readWorkbook(new Uint8Array())).toThrow(/abas/)
  })
})
