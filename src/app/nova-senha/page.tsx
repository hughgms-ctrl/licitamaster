"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { TelaEntrada } from "@/components/TelaEntrada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo } from "@/components/ui/campo";
import { Aviso } from "@/components/ui/aviso";
import { definirNovaSenha } from "../entrar/acoes";

/** Chega-se aqui pelo link de "Esqueci a senha", já com sessão aberta. */
export default function NovaSenha() {
  const [msg, acao, enviando] = useActionState(definirNovaSenha, null);
  return (
    <TelaEntrada titulo="Senha nova">
      <form action={acao} className="space-y-4">
        <Campo rotulo="Senha nova" dica="Pelo menos 8 caracteres.">
          <Input type="password" name="senha" autoComplete="new-password" minLength={8} autoFocus required />
        </Campo>
        <Campo rotulo="Repita a senha">
          <Input type="password" name="confirma" autoComplete="new-password" minLength={8} required />
        </Campo>
        {msg && <Aviso tom="erro">{msg}</Aviso>}
        <Button className="w-full" disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" />}
          {enviando ? "Salvando…" : "Salvar senha e entrar"}
        </Button>
      </form>
    </TelaEntrada>
  );
}
