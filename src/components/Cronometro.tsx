"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Sem mexer por este tempo, a pessoa saiu da frente da tela. */
const OCIOSO_MS = 120_000;
const ENVIO_MS = 60_000;

/**
 * Mede o tempo de trabalho sem ninguém apertar botão: conta os segundos em
 * que a página está visível e a pessoa mexeu nela nos últimos 2 minutos, e
 * manda em blocos para /api/tempo. Na página de uma licitação, o tempo vai
 * para ela; no resto da mesa, fica sem licitação. Não desenha nada.
 */
export default function Cronometro() {
  const caminho = usePathname();
  const disputaId = caminho.match(/^\/disputas\/([0-9a-f-]{36})/i)?.[1];
  useEffect(() => {
    let acumulado = 0;
    let ultimoMovimento = Date.now();
    const mexeu = () => (ultimoMovimento = Date.now());
    const eventos = ["pointerdown", "keydown", "scroll", "pointermove"] as const;
    eventos.forEach((e) => window.addEventListener(e, mexeu, { passive: true }));

    const tique = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - ultimoMovimento < OCIOSO_MS) acumulado += 5;
    }, 5_000);

    function enviar(saindo: boolean) {
      if (acumulado < 5) return;
      const corpo = JSON.stringify({ disputa_id: disputaId ?? null, segundos: acumulado });
      acumulado = 0;
      if (saindo && navigator.sendBeacon) navigator.sendBeacon("/api/tempo", corpo);
      else fetch("/api/tempo", { method: "POST", body: corpo, keepalive: true }).catch(() => {});
    }
    const periodico = window.setInterval(() => enviar(false), ENVIO_MS);
    const aoEsconder = () => document.visibilityState === "hidden" && enviar(true);
    const aoSair = () => enviar(true);
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", aoSair);

    return () => {
      enviar(true);
      eventos.forEach((e) => window.removeEventListener(e, mexeu));
      window.clearInterval(tique);
      window.clearInterval(periodico);
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", aoSair);
    };
  }, [disputaId]);
  return null;
}
