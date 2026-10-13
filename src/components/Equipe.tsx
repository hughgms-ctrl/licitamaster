"use client";

import { useActionState } from "react";
import { UserMinus } from "lucide-react";
import { liberarEmail, removerOperador } from "@/app/(mesa)/configuracoes/acoes";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { Secao } from "./ui/campo";
import { Aviso } from "./ui/aviso";
import { StatusDot } from "./ui/status-dot";
import { useConfirmar } from "./ui/confirmar";

interface Membro {
  email: string;
  nome: string | null;
  papel: "admin" | "operador";
}

export default function Equipe({ membros, eu }: { membros: Membro[]; eu: string }) {
  const [saida, acao, enviando] = useActionState(liberarEmail, null);
  const [confirmar, dialogo] = useConfirmar();
  return (
    <Secao
      titulo="Equipe"
      descricao={
        <>
          Só entra na mesa quem está nesta lista. Libere o e-mail aqui e a pessoa cria a conta em
          &quot;Criar conta&quot;, na tela de entrada.
        </>
      }
    >
      <ul className="divide-y overflow-hidden rounded-md border">
        {membros.map((m) => (
          <li key={m.email} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.nome || m.email}</span>
              {m.nome && <span className="block truncate text-xs text-muted-foreground">{m.email}</span>}
            </span>
            <StatusDot tom={m.papel === "admin" ? "primario" : "neutro"}>
              {m.papel === "admin" ? "Administrador" : "Operador"}
            </StatusDot>
            {m.email !== eu ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remover ${m.email}`}
                onClick={async () => {
                  if (
                    await confirmar({
                      titulo: `Tirar ${m.email} da equipe?`,
                      texto: "A pessoa perde o acesso na hora.",
                      confirmar: "Remover",
                      destrutivo: true,
                    })
                  ) {
                    await removerOperador(m.email);
                  }
                }}
              >
                <UserMinus />
              </Button>
            ) : (
              <span className="w-8 text-center text-xs text-muted-foreground">você</span>
            )}
          </li>
        ))}
      </ul>
      <form action={acao} className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="sm:flex-1"
          type="email"
          name="email"
          aria-label="E-mail"
          placeholder="email@empresa.com.br"
          required
        />
        <NativeSelect className="sm:w-40" name="papel" defaultValue="operador" aria-label="Papel">
          <option value="operador">Operador</option>
          <option value="admin">Administrador</option>
        </NativeSelect>
        <Button disabled={enviando}>Liberar e-mail</Button>
      </form>
      {saida && <Aviso tom={saida.ok ? "sucesso" : "erro"}>{saida.mensagem}</Aviso>}
      {dialogo}
    </Secao>
  );
}
