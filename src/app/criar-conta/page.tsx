"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { TelaEntrada, linkEntrada } from "@/components/TelaEntrada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo } from "@/components/ui/campo";
import { Aviso } from "@/components/ui/aviso";
import { criarConta } from "../entrar/acoes";

export default function CriarConta() {
  const [msg, acao, enviando] = useActionState(criarConta, null);

  if (msg === "ENVIADO") {
    return (
      <TelaEntrada
        titulo="Confirme o seu e-mail"
        sub="Enviamos um link de confirmação. Abra o e-mail e clique no link para ativar a conta."
      >
        <div className="space-y-4">
          <Aviso>
            <span className="flex items-center gap-2">
              <MailCheck className="size-4 shrink-0" />
              Não chegou? Confira a caixa de spam. O link vale por 24 horas.
            </span>
          </Aviso>
          <Button asChild variant="outline" className="w-full">
            <Link href="/entrar">Voltar para a entrada</Link>
          </Button>
        </div>
      </TelaEntrada>
    );
  }

  return (
    <TelaEntrada
      titulo="Criar conta"
      sub="Para a equipe que opera as licitações. Seu e-mail precisa ter sido liberado pelo administrador. A primeira conta do sistema vira a administradora."
      rodape={
        <Link href="/entrar" className={linkEntrada}>
          Já tenho conta
        </Link>
      }
    >
      <form action={acao} className="space-y-4">
        <Campo rotulo="Nome">
          <Input name="nome" autoComplete="name" />
        </Campo>
        <Campo rotulo="E-mail">
          <Input type="email" name="email" autoComplete="email" required />
        </Campo>
        <Campo rotulo="Senha" dica="Pelo menos 8 caracteres.">
          <Input type="password" name="senha" autoComplete="new-password" minLength={8} required />
        </Campo>
        <Campo rotulo="Repita a senha">
          <Input type="password" name="confirma" autoComplete="new-password" minLength={8} required />
        </Campo>
        {msg && <Aviso tom="erro">{msg}</Aviso>}
        <Button className="w-full" disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" />}
          {enviando ? "Criando…" : "Criar conta"}
        </Button>
      </form>
    </TelaEntrada>
  );
}
