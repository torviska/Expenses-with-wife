import { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// --- Variáveis de ambiente ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const allowedEmails = String(import.meta.env.VITE_ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase());

const person1Name = (import.meta.env.VITE_PERSON1_NAME as string) || "Pessoa 1";
const person2Name = (import.meta.env.VITE_PERSON2_NAME as string) || "Pessoa 2";

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnon);

// --- Tipos ---
type TipoDespesa = "Shared" | "Per Person";
type Pessoa = "You" | "Wife";

type Despesa = {
  id: string;
  name: string;
  amount: number;
  type: TipoDespesa;
  paid_by: Pessoa;
  user_id: string | null;
  created_at: string;
};

// --- Helpers ---
const moeda = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR" }).format(
    n
  );

function labelTipo(type: TipoDespesa) {
  return type === "Shared" ? "Comp." : "Ind.";
}

function labelPessoa(p: Pessoa) {
  return p === "You" ? person1Name : person2Name;
}

// --- Componente Segmented (corrigido) ---
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="w-full flex bg-zinc-100 rounded-xl p-1 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={[
            "flex-1 px-2 py-2 text-xs sm:text-sm rounded-lg transition text-center whitespace-nowrap",
            value === o.value ? "bg-white shadow font-medium" : "text-zinc-500",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --- APP PRINCIPAL ---
export default function App() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(false);

  const [itens, setItens] = useState<Despesa[]>([]);
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<TipoDespesa>("Shared");
  const [pagoPor, setPagoPor] = useState<Pessoa>("You");
  const [editando, setEditando] = useState<Despesa | null>(null);

  // ---- LOGIN / SESSÃO ----
  async function enviarMagicLink() {
    if (!email) return alert("Digite seu e-mail.");
    if (!allowedEmails.includes(email.toLowerCase())) {
      alert("Este e-mail não tem acesso ao app.");
      return;
    }

    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setCarregando(false);

    if (error) alert(error.message);
    else alert("Enviamos um link de acesso para o seu e-mail.");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const e = data.session?.user.email ?? null;
      if (e && allowedEmails.includes(e.toLowerCase())) {
        setSessionEmail(e);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const e = session?.user?.email ?? null;
        if (e && allowedEmails.includes(e.toLowerCase())) {
          setSessionEmail(e);
        } else {
          setSessionEmail(null);
        }
      }
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    setSessionEmail(null);
  }

  // ---- SUPABASE: LISTAR ----
  async function carregar() {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    if (data) setItens(data);
  }

  useEffect(() => {
    if (sessionEmail) carregar();
  }, [sessionEmail]);

  // ---- SUPABASE: ADICIONAR / EDITAR ----
  async function salvar() {
    if (!valor || !nome) {
      alert("Preencha o valor e o nome da despesa.");
      return;
    }

    const numero = Number(valor.replace(",", "."));
    if (isNaN(numero)) {
      alert("Valor inválido.");
      return;
    }

    if (editando) {
      const { error } = await supabase
        .from("expenses")
        .update({
          name: nome,
          amount: numero,
          type: tipo,
          paid_by: pagoPor,
        })
        .eq("id", editando.id);

      if (error) {
        alert(error.message);
        return;
      }

      setEditando(null);
    } else {
      const { error } = await supabase.from("expenses").insert({
        name: nome,
        amount: numero,
        type: tipo,
        paid_by: pagoPor,
        user_id: sessionEmail,
      });

      if (error) {
        alert(error.message);
        return;
      }
    }

    setNome("");
    setValor("");
    setTipo("Shared");
    setPagoPor("You");
    carregar();
  }

  async function apagar(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    carregar();
  }

  // ---- SALDO ----
  const saldo = useMemo(() => {
    let total = 0;

    itens.forEach((i) => {
      if (i.type === "Shared") {
        if (i.paid_by === "You") total += i.amount / 2;
        else total -= i.amount / 2;
      } else {
        if (i.paid_by === "You") total += i.amount;
        else total -= i.amount;
      }
    });

    return total;
  }, [itens]);

  // ============================================================
  //  TELAS
  // ============================================================

  // Tela de login
  if (!sessionEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 space-y-4">
          <h1 className="text-xl font-semibold text-center">
            Despesas Compartilhadas
          </h1>
          <p className="text-sm text-zinc-500 text-center">
            Acesso restrito para e-mails autorizados.
          </p>

          <input
            className="border border-zinc-300 p-3 rounded-xl w-full text-sm"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />

          <button
            onClick={enviarMagicLink}
            disabled={carregando}
            className="bg-zinc-900 text-white p-3 rounded-xl w-full text-sm font-medium disabled:opacity-50"
          >
            {carregando ? "Enviando..." : "Enviar link por e-mail"}
          </button>

          <p className="text-xs text-zinc-400 text-center">
            Use um dos e-mails autorizados configurados no sistema.
          </p>
        </div>
      </div>
    );
  }

  // Tela principal logada
  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="max-w-xl mx-auto px-4 py-4 space-y-5 pb-16">
        {/* Header */}
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold">Despesas Compartilhadas V2</h1>
            <p className="text-xs text-zinc-500">
              Entre {person1Name} e {person2Name}
            </p>
          </div>
          <button onClick={sair} className="text-xs text-zinc-500 underline">
            Sair
          </button>
        </header>

        {/* Saldo */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-zinc-200 text-center space-y-1">
          <p className="text-xs text-zinc-500">Saldo atual</p>

          <p className="text-xs text-zinc-500">
            {saldo >= 0
              ? `${person2Name} deve para ${person1Name}`
              : `${person1Name} deve para ${person2Name}`}
          </p>

          <p
            className={[
              "text-4xl font-extrabold",
              saldo >= 0 ? "text-emerald-600" : "text-orange-500",
            ].join(" ")}
          >
            {moeda(Math.abs(saldo))}
          </p>
        </section>

        {/* Formulário */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-zinc-200 space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-zinc-500">Valor</label>
            <input
              className="border border-zinc-300 p-3 rounded-xl w-full text-sm"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-500">Nome da despesa</label>
            <input
              className="border border-zinc-300 p-3 rounded-xl w-full text-sm"
              placeholder="Ex: Supermercado, aluguel..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-zinc-600 w-full">
            <div className="w-full space-y-2">
              <span className="block text-sm text-zinc-500">Tipo</span>
              <Segmented
                value={tipo}
                onChange={(v) => setTipo(v)}
                options={[
                  { value: "Shared", label: "Compart." },
                  { value: "Per Person", label: "Ind." },
                ]}
              />
            </div>

            <div className="w-full space-y-2">
              <span className="block text-sm text-zinc-500">Pago por</span>
              <Segmented
                value={pagoPor}
                onChange={(v) => setPagoPor(v)}
                options={[
                  { value: "You", label: person1Name },
                  { value: "Wife", label: person2Name },
                ]}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            {editando && (
              <button
                onClick={() => {
                  setEditando(null);
                  setNome("");
                  setValor("");
                  setTipo("Shared");
                  setPagoPor("You");
                }}
                className="flex-1 rounded-xl border border-zinc-300 py-2 text-sm"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={salvar}
              className="flex-1 rounded-xl bg-zinc-900 text-white py-2 text-sm font-medium"
            >
              {editando ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </section>

        {/* Lista de despesas */}
        <section className="space-y-3">
          {itens.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center mt-6">
              Nenhuma despesa adicionada ainda.
            </p>
          ) : (
            itens.map((i) => (
              <div
                key={i.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-200 flex justify-between items-center gap-3"
              >
                <div className="space-y-1">
                  <div className="font-medium text-sm">{i.name}</div>
                  <div className="text-xs text-zinc-500">
                    {labelPessoa(i.paid_by)} – {labelTipo(i.type)}
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="text-sm font-semibold">
                    {moeda(i.amount)}
                  </div>
                  <div className="flex gap-2 justify-end text-xs">
                    <button
                      onClick={() => {
                        setEditando(i);
                        setNome(i.name);
                        setValor(String(i.amount));
                        setTipo(i.type);
                        setPagoPor(i.paid_by);
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
            ))
          )}
        </section>
      </div>
    </div>
  );
}