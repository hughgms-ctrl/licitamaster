import Link from "next/link";
import { sair } from "@/app/entrar/acoes";

const MARCA = "Licitação Master";

/**
 * Barra superior da mesa de operação: marca, navegação e saída. Quando a
 * página tem título próprio (clientes, um cliente), ele aparece abaixo da
 * barra, como título da página — não espremido ao lado da marca.
 */
export default function Topo({
  titulo,
  sub,
  atual,
}: {
  titulo: string;
  sub?: string;
  atual: "mesa" | "clientes";
}) {
  return (
    <>
      <header className="topo">
        <Link href="/" className="topo-marca">
          <Selo />
          {MARCA}
        </Link>
        <nav className="topo-nav" aria-label="Seções">
          <Link className="nav-link" aria-current={atual === "mesa" ? "page" : undefined} href="/">
            Mesa
          </Link>
          <Link
            className="nav-link"
            aria-current={atual === "clientes" ? "page" : undefined}
            href="/clientes"
          >
            Clientes
          </Link>
        </nav>
        <form action={sair} className="topo-sair">
          <button className="btn btn-discreto">Sair</button>
        </form>
      </header>
      {titulo !== MARCA && (
        <div className="titulo-pagina">
          <h1>{titulo}</h1>
          {sub && <p>{sub}</p>}
        </div>
      )}
    </>
  );
}

/** Marca: um carimbo de protocolo, o gesto que encerra toda etapa de licitação. */
function Selo() {
  return (
    <svg className="topo-selo" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="1.6 1.4" />
      <path d="M8.2 12.3l2.5 2.5 5-5.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
