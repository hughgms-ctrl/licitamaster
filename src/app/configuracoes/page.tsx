import Topo from "@/components/Topo";
import FormIA from "@/components/FormIA";
import { MODELOS_ANTHROPIC, MODELO_PADRAO, resumoConfigIA } from "@/lib/config-ia";
import { formatarData } from "@/lib/formato";
import { removerIA } from "./acoes";

export const dynamic = "force-dynamic";

export default async function Configuracoes() {
  let atual = null;
  let falha: string | null = null;
  try {
    atual = await resumoConfigIA();
  } catch (e) {
    falha = (e as Error).message;
  }

  return (
    <>
      <Topo titulo="Configurações" sub="O motor de IA que lê licitações e editais." atual="configuracoes" />
      <main className="pagina pagina-duas">
        <section>
          <FormIA
            modelosAnthropic={MODELOS_ANTHROPIC}
            modeloPadrao={MODELO_PADRAO}
            provedorAtual={atual?.provedor ?? "anthropic"}
            modeloAtual={atual?.modelo ?? null}
          />
        </section>
        <section className="editor">
          <div className="editor-secao">
            <h3 className="editor-titulo">Em uso agora</h3>
            {falha ? (
              <p className="aviso aviso-erro">
                Não deu para ler a configuração: {falha}. Confira se a migration de configurações já
                foi aplicada.
              </p>
            ) : !atual ? (
              <p className="dica">
                Nenhuma chave configurada. Sem ela, a coleta e a mesa funcionam, mas &quot;Analisar com
                IA&quot;, a leitura de edital e o assistente de termos ficam desligados.
              </p>
            ) : (
              <>
                <dl className="fatos">
                  <div>
                    <dt>Provedor</dt>
                    <dd>{atual.provedor === "anthropic" ? "Claude (Anthropic)" : "OpenAI"}</dd>
                  </div>
                  <div>
                    <dt>Modelo</dt>
                    <dd>{atual.modelo}</dd>
                  </div>
                  <div>
                    <dt>Chave</dt>
                    <dd className="num">terminada em {atual.finalChave}</dd>
                  </div>
                  <div>
                    <dt>Origem</dt>
                    <dd>
                      {atual.origem === "painel"
                        ? `Painel, ${formatarData(atual.atualizadoEm)}`
                        : "Variável de ambiente"}
                    </dd>
                  </div>
                </dl>
                {atual.ilegivel && (
                  <p className="aviso aviso-erro">
                    A chave salva não pode mais ser lida (o segredo do servidor mudou). Cadastre de novo.
                  </p>
                )}
                {atual.origem === "painel" && (
                  <form action={removerIA}>
                    <button className="btn btn-perigo" style={{ marginLeft: 0 }}>
                      Remover chave
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
          <div className="editor-secao">
            <h3 className="editor-titulo">Como a chave é guardada</h3>
            <p className="dica">
              A chave é testada no provedor antes de ser salva e fica cifrada no banco (AES-256). A
              tela nunca mostra a chave inteira, só os últimos 4 caracteres. O uso é cobrado pelo
              provedor, na conta dona da chave.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
