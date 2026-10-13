"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

interface Pedido {
  titulo: string;
  texto?: string;
  confirmar?: string;
  destrutivo?: boolean;
}

/**
 * Troca o `confirm()` do navegador por um diálogo no tema. Uso:
 *   const [confirmar, dialogo] = useConfirmar();
 *   if (!(await confirmar({ titulo: "Apagar?" }))) return;
 *   ...e renderizar {dialogo} em algum lugar do componente.
 */
export function useConfirmar(): [(p: Pedido) => Promise<boolean>, React.ReactNode] {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirmar = useCallback(
    (p: Pedido) =>
      new Promise<boolean>((res) => {
        resolver.current = res;
        setPedido(p);
      }),
    []
  );

  function fechar(v: boolean) {
    resolver.current?.(v);
    resolver.current = null;
    setPedido(null);
  }

  const dialogo = (
    <AlertDialog open={pedido != null} onOpenChange={(aberto) => !aberto && fechar(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
          {pedido?.texto && <AlertDialogDescription>{pedido.texto}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => fechar(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction destrutivo={pedido?.destrutivo} onClick={() => fechar(true)}>
            {pedido?.confirmar ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirmar, dialogo];
}
