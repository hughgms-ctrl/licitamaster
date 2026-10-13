"use client";

import { useEffect, useState } from "react";

const LIMITE = 1024;

export function useIsMobile() {
  const [mobile, setMobile] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${LIMITE - 1}px)`);
    const mudar = () => setMobile(window.innerWidth < LIMITE);
    mql.addEventListener("change", mudar);
    mudar();
    return () => mql.removeEventListener("change", mudar);
  }, []);
  return !!mobile;
}
