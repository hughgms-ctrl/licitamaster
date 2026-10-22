import { operadorAtual } from "@/lib/auth";
import { MenuLateral } from "@/components/MenuLateral";
import Cronometro from "@/components/Cronometro";

export default async function LayoutMesa({ children }: { children: React.ReactNode }) {
  const eu = await operadorAtual().catch(() => null);
  return (
    <div className="min-h-dvh">
      <MenuLateral usuario={eu} />
      {eu && <Cronometro />}
      <div className="lg:pl-60 print:pl-0">
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
