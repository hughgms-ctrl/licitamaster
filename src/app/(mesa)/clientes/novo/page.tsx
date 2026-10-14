import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirOperadorPagina } from "@/lib/auth";
import { Cabecalho } from "@/components/Cabecalho";
import FormCliente from "@/components/FormCliente";
import { criarCliente } from "../acoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo cliente · Licitação Master" };

export default async function NovoCliente() {
  await exigirOperadorPagina();
  return (
    <div className="max-w-3xl">
      <Cabecalho
        titulo="Novo cliente"
        sub="Depois do cadastro, você monta o perfil de busca: é ele que diz à coleta quais licitações procurar."
        antes={
          <Link href="/clientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            Clientes
          </Link>
        }
      />
      <FormCliente acao={criarCliente} rotulo="Cadastrar cliente" />
    </div>
  );
}
