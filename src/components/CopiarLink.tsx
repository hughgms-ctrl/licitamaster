"use client";

import { useState } from "react";

export default function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="copiar">
      <input className="campo" readOnly value={link} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            /* sem permissão de clipboard: o campo já seleciona ao focar */
          }
        }}
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
