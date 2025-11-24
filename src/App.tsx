import { useEffect, useMemo, useState } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// --- Variáveis de ambiente ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const allowedEmails = String(import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())

const person1Name = (import.meta.env.VITE_PERSON1_NAME as string) || 'Pessoa 1'
const person2Name = (import.meta.env.VITE_PERSON2_NAME as string) || 'Pessoa 2'

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnon)

// --- Tipos ---
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

// --- Formatação ---
const moeda = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' }).format(n)

function labelTipo(type: TipoDespesa) {
  return type === 'Shared' ? 'Compartilhada' : 'Individual'
}

function labelPessoa(p: Pessoa) {
  return p === 'You' ? person1Name : person2Name
}

// --- Componente Segmented (corrigido e com espaçamento) ---
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
    <div className="grid grid-cols-2 gap-2 bg-zinc-100 rounded-xl p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={[
            'px-3 py-1 text-xs sm:text-sm rounded-lg transition whitespace-nowrap',
            value === o.value ? 'bg-white shadow font-medium' : 'text-zinc-500',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// --- APP PRINCIPAL ---
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

  // ---- LOGIN ----
  async function enviarMagicLink() {
    if (!email) return alert('Digite seu e-mail!')
    if (!allowedEmails.includes(email.toLowerCase())) {
      alert('Este e-mail não tem acesso ao app.')
      return
    }

    setCarregando(true)
    const { error } = await supabase.auth.signInWithOtp({ email })
    setCarregando(false)

    if (error) alert(error.message)
    else alert('Pronto! Verifique seu e-mail.')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const e = data.session?.user.email ?? null
      if (e && allowedEmails.includes(e.toLowerCase())) {
        setSessionEmail(e)
      }
    })

    const listener = supabase.auth.onAuthStateChange((_e, s) => {
      const e = s?.user?.email ?? null
      if (e && allowedEmails.includes(e.toLowerCase())) {
        setSessionEmail(e)
      }
    })

    return () => {
      listener.data.subscription.unsubscribe()
    }
  }, [])

  async function sair() {
    await supabase.auth.signOut()
    setSessionEmail(null)
  }

  // ---- SUPABASE: LISTAR ----
  async function carregar() {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) setItens(data)
  }

  useEffect(() => {
    if (sessionEmail) carregar()
  }, [sessionEmail])

  // ---- SUPABASE: ADICIONAR / EDITAR ----
  async function salvar() {
    if (!valor || !nome) return alert('Preencha valor e nome da despesa.')

    const v = Number(valor.replace(',', '.'))
    if (isNaN(v)) return alert('Valor inválido.')

    if (editando) {
      await supabase
        .from('expenses')
        .update({
          name: nome,
          amount: v,
          type: tipo,
          paid_by: pagoPor,
        })
        .eq('id', editando.id)

      setEditando(null)
    } else {
      await supabase.from('expenses').insert({
        name: nome,
        amount: v,
        type: tipo,
        paid_by: pagoPor,
        user_id: sessionEmail,
      })
    }

    setNome('')
    setValor('')
    carregar()
  }

  async function apagar(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    carregar()
  }

  // ---- SALDO ----
  const saldo = useMemo(() => {
    let total = 0

    itens.forEach((i) => {
      if (i.type === 'Shared') {
        if (i.paid_by === 'You') total += i.amount / 2
        else total -= i.amount / 2
      } else {
        if (i.paid_by === 'You') total += i.amount
        else total -= i.amount
      }
    })

    return total
  }, [itens])

  // ============================================================
  //  UI PRINCIPAL
  // ============================================================

  if (!sessionEmail)
    return (
      <div className="p-6 max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Despesas Compartilhadas</h1>

        <input
          className="border p-3 rounded w-full"
          placeholder="Seu e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          onClick={enviarMagicLink}
          disabled={carregando}
          className="bg-zinc-800 text-white p-3 rounded w-full disabled:opacity-40"
        >
          Enviar link por e-mail
        </button>

        <p className="text-sm text-zinc-500">
          Somente e-mails autorizados podem entrar.
        </p>
      </div>
    )

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6 pb-14">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Despesas Compartilhadas</h1>
        <button onClick={sair} className="text-zinc-500">
          Sair
        </button>
      </div>

      {/* Saldos */}
      <div className="bg-zinc-100 rounded-2xl p-6 text-center space-y-1">
        <div className="text-lg font-medium">Saldo atual</div>

        <div className="text-sm text-zinc-500">
          {saldo >= 0
            ? `${person2Name} deve para ${person1Name}`
            : `${person1Name} deve para ${person2Name}`}
        </div>

        <div
          className={[
            'text-5xl font-bold',
            saldo >= 0 ? 'text-green-600' : 'text-red-600',
          ].join(' ')}
        >
          {moeda(Math.abs(saldo))}
        </div>
      </div>

      {/* Formulário */}
      <div className="bg-zinc-100 rounded-2xl p-4 space-y-4">
        <input
          className="border p-3 rounded w-full"
          placeholder="0,00"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />

        <input
          className="border p-3 rounded w-full"
          placeholder="Nome da despesa"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-zinc-500">Tipo</label>
            <Segmented
              value={tipo}
              onChange={setTipo}
              options={[
                { value: 'Shared', label: 'Compartilhada' },
                { value: 'Per Person', label: 'Individual' },
              ]}
            />
          </div>

          <div>
            <label className="text-sm text-zinc-500">Pago por</label>
            <Segmented
              value={pagoPor}
              onChange={setPagoPor}
              options={[
                { value: 'You', label: person1Name },
                { value: 'Wife', label: person2Name },
              ]}
            />
          </div>
        </div>

        <button
          onClick={salvar}
          className="bg-zinc-700 text-white p-3 rounded w-full"
        >
          Adicionar
        </button>

        <button
          onClick={() => {
            setNome('')
            setValor('')
            setEditando(null)
          }}
          className="text-center w-full text-zinc-500 text-sm"
        >
          Limpar tudo
        </button>
      </div>

      {/* Lista */}
      {itens.map((i) => (
        <div
          key={i.id}
          className="bg-zinc-100 rounded-2xl p-4 flex justify-between items-center"
        >
          <div>
            <div className="font-medium">{i.name}</div>
            <div className="text-sm text-zinc-500">
              {labelPessoa(i.paid_by)} – {labelTipo(i.type)}
            </div>
          </div>

          <div className="text-right space-y-1">
            <div className="text-lg font-semibold">{moeda(i.amount)}</div>

            <div className="text-sm flex gap-2 justify-end">
              <button
                onClick={() => {
                  setEditando(i)
                  setNome(i.name)
                  setValor(String(i.amount))
                  setTipo(i.type)
                  setPagoPor(i.paid_by)
                }}
                className="text-blue-600"
              >
                Editar
              </button>

              <button
                onClick={() => apagar(i.id)}
                className="text-red-600"
              >
                Apagar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}