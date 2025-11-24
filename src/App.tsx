import { useEffect, useMemo, useState } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const allowedEmails = String(import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnon)

type TipoDespesa = 'Shared' | 'Per Person'
type Pessoa = 'You' | 'Wife'

type Despesa = {
  id: string
  name: string
  amount: number
  type: TipoDespesa
  paid_by: Pessoa
  user_id: string | null
  created_at: string
}

const moeda = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' }).format(n)

function labelTipo(type: TipoDespesa) {
  return type === 'Shared' ? 'Compartilhada' : 'Individual'
}

function labelPessoa(p: Pessoa) {
  return p === 'You' ? 'Voce' : 'Ela'
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="grid grid-cols-2 bg-zinc-100 rounded-xl p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={[
            'px-3 py-1 text-sm rounded-lg transition',
            value === o.value ? 'bg-white shadow font-medium' : 'text-zinc-500',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [carregando, setCarregando] = useState(false)

  const [itens, setItens] = useState<Despesa[]>([])
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<TipoDespesa>('Shared')
  const [pagoPor, setPagoPor] = useState<Pessoa>('You')
  const [editando, setEditando] = useState<Despesa | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const currentEmail = data.session?.user?.email?.toLowerCase() || null
      setSessionEmail(currentEmail)

      supabase.auth.onAuthStateChange((_event, s) => {
        const em = s?.user?.email?.toLowerCase() || null
        setSessionEmail(em)
      })
    })()
  }, [])

  const buscarDespesas = async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar despesas', error)
      return
    }

    setItens((data || []) as Despesa[])
  }

  useEffect(() => {
    if (!sessionEmail) return

    buscarDespesas()

    const channel = supabase
      .channel('expenses-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => {
          buscarDespesas()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionEmail])

  const saldo = useMemo(() => {
    let totalVoce = 0
    let totalEla = 0

    itens.forEach((e) => {
      if (e.type === 'Shared') {
        if (e.paid_by === 'You') totalVoce += e.amount / 2
        else totalEla += e.amount / 2
      } else {
        if (e.paid_by === 'You') totalVoce += e.amount
        else totalEla += e.amount
      }
    })

    return totalVoce - totalEla
  }, [itens])

  const podeSalvar = nome.trim() !== '' && parseValor(valor) !== null

  function parseValor(raw: string) {
    const v = raw.replace(',', '.')
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  async function salvarOuAtualizar() {
    const v = parseValor(valor)
    if (v === null) return

    if (editando) {
      const { error } = await supabase
        .from('expenses')
        .update({
          name: nome,
          amount: v,
          type: tipo,
          paid_by: pagoPor,
        })
        .eq('id', editando.id)

      if (error) {
        alert(error.message)
        return
      }

      setEditando(null)
    } else {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id ?? null

      const { error } = await supabase.from('expenses').insert({
        name: nome,
        amount: v,
        type: tipo,
        paid_by: pagoPor,
        user_id: userId,
      })

      if (error) {
        alert(error.message)
        return
      }
    }

    setNome('')
    setValor('')
    setTipo('Shared')
    setPagoPor('You')

    // garante atualizar lista mesmo se o realtime nao estiver ativo
    buscarDespesas()
  }

  async function remover(id: string) {
    if (!confirm('Apagar esta despesa?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    buscarDespesas()
  }

  function iniciarEdicao(e: Despesa) {
    setEditando(e)
    setNome(e.name)
    setValor(String(e.amount))
    setTipo(e.type)
    setPagoPor(e.paid_by)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function limparTudo() {
    if (!confirm('Tem certeza que deseja limpar todas as despesas?')) return
    const { error } = await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) {
      alert(error.message)
      return
    }
    buscarDespesas()
  }

  const entrar = async () => {
    const e = email.trim().toLowerCase()
    if (!allowedEmails.includes(e)) {
      alert('Acesso restrito. Use um e-mail autorizado.')
      return
    }

    setCarregando(true)

    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: window.location.origin },
    })

    setCarregando(false)

    if (error) alert(error.message)
    else alert('Enviamos um link de acesso para o seu e-mail.')
  }

  const sair = async () => {
    await supabase.auth.signOut()
  }

  if (!sessionEmail) {
    return (
      <div className="min-h-dvh bg-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center mb-2">Despesas Compartilhadas</h1>
          <p className="text-center text-zinc-500 mb-6">Acesso restrito</p>
          <div className="space-y-3">
            <input
              type="email"
              inputMode="email"
              placeholder="Seu e-mail"
              className="w-full rounded-xl border border-zinc-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              onClick={entrar}
              disabled={carregando || !email}
              className="w-full rounded-xl bg-black text-white py-3 font-medium disabled:opacity-50"
            >
              {carregando ? 'Enviando...' : 'Enviar link por e-mail'}
            </button>
          </div>
          <p className="text-xs text-center text-zinc-400 mt-4">
            Somente e-mails autorizados podem entrar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#f6f7f8]">
      <div className="sticky top-0 z-10 bg-[#f6f7f8]/90 backdrop-blur border-b border-zinc-200/60">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Despesas Compartilhadas</h1>
          <button onClick={sair} className="text-sm text-zinc-500">
            Sair
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="rounded-2xl bg-white shadow-sm border border-zinc-200 p-4 text-center">
          <p className="text-sm text-zinc-500">Saldo atual</p>
          {saldo > 0 ? (
            <>
              <p className="text-xs text-zinc-500">Ela deve para voce</p>
              <p className="text-5xl font-extrabold text-emerald-600">{moeda(Math.abs(saldo))}</p>
            </>
          ) : saldo < 0 ? (
            <>
              <p className="text-xs text-zinc-500">Voce deve para ela</p>
              <p className="text-5xl font-extrabold text-orange-500">{moeda(Math.abs(saldo))}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-500">Tudo certo!</p>
              <p className="text-5xl font-extrabold text-zinc-400">{moeda(0)}</p>
            </>
          )}
        </div>

        <div className="rounded-2xl bg-white shadow-sm border border-zinc-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">€</span>
            <input
              className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              placeholder="0,00"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            placeholder="Nome da despesa"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Tipo</p>
              <Segmented
                value={tipo}
                onChange={(v) => setTipo(v)}
                options={[
                  { value: 'Shared', label: 'Compartilhada' },
                  { value: 'Per Person', label: 'Individual' },
                ]}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Pago por</p>
              <Segmented
                value={pagoPor}
                onChange={(v) => setPagoPor(v)}
                options={[
                  { value: 'You', label: 'Voce' },
                  { value: 'Wife', label: 'Ela' },
                ]}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            {editando && (
              <button
                onClick={() => {
                  setEditando(null)
                  setNome('')
                  setValor('')
                  setTipo('Shared')
                  setPagoPor('You')
                }}
                className="flex-1 rounded-xl border border-zinc-200 py-2"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={salvarOuAtualizar}
              disabled={!podeSalvar}
              className="flex-1 rounded-xl bg-black text-white py-2 font-medium disabled:opacity-50"
            >
              {editando ? 'Salvar' : 'Adicionar'}
            </button>
          </div>

          {itens.length > 0 && (
            <button onClick={limparTudo} className="w-full text-xs text-zinc-500 underline">
              Limpar tudo
            </button>
          )}
        </div>

        <div className="space-y-3 pb-10">
          {itens.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm py-10">Ainda nao ha despesas</div>
          ) : (
            itens.map((e) => (
              <div
                key={e.id}
                className="rounded-2xl bg-white shadow-sm border border-zinc-200 p-4 flex items-start justify-between"
              >
                <div>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-zinc-500 flex gap-2 mt-1">
                    <span>{labelPessoa(e.paid_by)}</span>
                    <span>•</span>
                    <span>{labelTipo(e.type)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{moeda(e.amount)}</div>
                  <div className="flex gap-2 justify-end mt-2">
                    <button
                      onClick={() => iniciarEdicao(e)}
                      className="text-xs text-zinc-600 underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => remover(e.id)}
                      className="text-xs text-red-600 underline"
                    >
                      Apagar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
