import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db, type ClienteRow } from "@/lib/db";
import { lerAssessoria } from "@/lib/assessoria";
import Procuracao from "@/components/Procuracao";
import { Marca } from "@/components/Marca";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Procuração",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** A procuração pronta para o cliente salvar, assinar no gov.br e enviar. */
export default async function ProcuracaoPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const { data: c } = await db()
    .from("clientes")
    .select("*")
    .eq("token_portal", token)
    .eq("ativo", true)
    .maybeSingle<ClienteRow>();
  if (!c) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 print:p-0">
      <div className="print:hidden">
        <Marca />
      </div>
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
        instrucoes={
          <div className="space-y-3 rounded-lg border bg-card p-4 text-sm leading-relaxed">
            <h1 className="text-lg font-semibold">Procuração para participarmos por você</h1>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Confira os dados abaixo. Se algo estiver errado, corrija direto no texto.</li>
              <li>Toque em &quot;Imprimir ou salvar PDF&quot; e escolha salvar como PDF.</li>
              <li>
                Assine o PDF de graça pelo gov.br, no{" "}
                <a className="text-primary underline dark:text-sidebar-primary" href="https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica" target="_blank" rel="noreferrer noopener">
                  assinador eletrônico
                </a>
                , com a conta do representante legal.
              </li>
              <li>Volte ao portal e envie o PDF assinado em &quot;Documentos da empresa&quot;, como &quot;Procuração&quot;.</li>
            </ol>
            <p className="text-muted-foreground">
              Ela nos permite enviar propostas, dar lances e recorrer em seu nome. Não permite receber dinheiro nem
              assinar contratos: isso continua com você.
            </p>
          </div>
        }
      />
    </div>
  );
}
