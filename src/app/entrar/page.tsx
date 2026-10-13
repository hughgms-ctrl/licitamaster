"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { TelaEntrada, linkEntrada } from "@/components/TelaEntrada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo } from "@/components/ui/campo";
import { Aviso } from "@/components/ui/aviso";
import { entrar } from "./acoes";

function Formulario() {
  const [erro, acao, enviando] = useActionState(entrar, null);
  const motivo = useSearchParams().get("motivo");
  return (
    <form action={acao} className="space-y-4">
      {motivo === "sem-acesso" && !erro && (
        <Aviso tom="erro">Sua conta ainda não foi liberada para a equipe. Peça ao administrador.</Aviso>
      )}
      {motivo === "link-invalido" && !erro && <Aviso tom="erro">O link expirou ou já foi usado. Peça outro.</Aviso>}
      <Campo rotulo="E-mail">
        <Input type="email" name="email" autoComplete="email" autoFocus required />
      </Campo>
      <Campo
        rotulo={
          <span className="flex items-center justify-between">
            Senha
            <Link href="/redefinir-senha" className="text-xs font-normal text-muted-foreground hover:text-foreground">
              Esqueci a senha
            </Link>
          </span>
        }
      >
        <Input type="password" name="senha" autoComplete="current-password" required />
      </Campo>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Button className="w-full" disabled={enviando}>
        {enviando && <Loader2 className="animate-spin" />}
        {enviando ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

export default function Entrar() {
  return (
    <TelaEntrada
      titulo="Entrar na mesa"
      sub="Mesa de operação. Entre com o seu e-mail."
      rodape={
        <span>
          Primeira vez?{" "}
          <Link href="/criar-conta" className={`font-medium text-foreground ${linkEntrada}`}>
            Criar conta
          </Link>
        </span>
      }
    >
      <Suspense>
        <Formulario />
      </Suspense>
    </TelaEntrada>
  );
}
