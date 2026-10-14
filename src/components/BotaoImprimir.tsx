"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui/button";

export function BotaoImprimir({ rotulo = "Imprimir ou salvar PDF" }: { rotulo?: string }) {
  return (
    <Button className="print:hidden" onClick={() => window.print()}>
      <Printer />
      {rotulo}
    </Button>
  );
}
