import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirOperadorPagina } from "@/lib/auth";
import { db, type ClienteRow } from "@/lib/db";
import { lerAssessoria } from "@/lib/assessoria";
import Procuracao from "@/components/Procuracao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Procuração · Licitação Master" };

export default async function ProcuracaoCliente({ params }: { params: Promise<{ id: string }> }) {
  await exigirOperadorPagina();
  const { id } = await params;
  const { data: c } = await db().from("clientes").select("*").eq("id", id).maybeSingle<ClienteRow>();
  if (!c) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/clientes/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" />
        {c.nome_fantasia || c.razao_social}
      </Link>
      <Procuracao
        assessoria={await lerAssessoria().catch(() => null)}
        outorgante={{
          razao_social: c.razao_social,
          cnpj: c.cnpj,
          endereco: c.endereco ?? null,
          cidade_uf: c.cidade_uf ?? null,
          representante_nome: c.representante_nome ?? c.contato_nome,
          representante_cpf: c.representante_cpf ?? null,
        }}
      />
    </div>
  );
}
