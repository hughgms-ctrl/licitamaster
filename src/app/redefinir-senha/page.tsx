"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { TelaEntrada, linkEntrada } from "@/components/TelaEntrada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo } from "@/components/ui/campo";
import { Aviso } from "@/components/ui/aviso";
import { pedirRedefinicao } from "../entrar/acoes";

export default function RedefinirSenha() {
  const [msg, acao, enviando] = useActionState(pedirRedefinicao, null);
  return (
    <TelaEntrada
      titulo="Esqueci a senha"
      sub={msg === "ENVIADO" ? undefined : "Enviamos um link para o seu e-mail para criar uma senha nova."}
      rodape={
        <Link href="/entrar" className={linkEntrada}>
          Voltar para a entrada
        </Link>
      }
    >
      {msg === "ENVIADO" ? (
        <Aviso tom="sucesso">
          Se este e-mail tiver conta, enviamos um link para criar uma senha nova. Confira também o spam.
        </Aviso>
      ) : (
        <form action={acao} className="space-y-4">
          <Campo rotulo="E-mail">
            <Input type="email" name="email" autoComplete="email" autoFocus required />
          </Campo>
          {msg && <Aviso tom="erro">{msg}</Aviso>}
          <Button className="w-full" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" />}
            {enviando ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
      )}
    </TelaEntrada>
  );
}
