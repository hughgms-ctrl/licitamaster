import { Marca } from "./Marca";
import { SeletorTema } from "./SeletorTema";

/** Moldura das telas de login: marca no topo, cartão no centro. */
export function TelaEntrada({
  titulo,
  sub,
  children,
  rodape,
}: {
  titulo: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <SeletorTema className="absolute right-4 top-4 z-10" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.10),transparent_70%)]"
      />
      <div className="relative w-full max-w-sm space-y-6">
        <Marca className="justify-center" />
        <div className="rounded-lg border bg-card p-6 shadow-sm dark:shadow-none">
          <div className="mb-5 space-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight">{titulo}</h1>
            {sub && <p className="text-sm leading-relaxed text-muted-foreground">{sub}</p>}
          </div>
          {children}
        </div>
        {rodape && <div className="flex justify-center gap-4 text-sm text-muted-foreground">{rodape}</div>}
      </div>
    </main>
  );
}

export const linkEntrada = "hover:text-foreground hover:underline";
