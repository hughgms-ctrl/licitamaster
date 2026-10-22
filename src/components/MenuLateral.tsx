"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, BookOpen, Building2, ChevronsUpDown, LayoutDashboard, LogOut, Menu, Settings, Wallet } from "lucide-react";
import { sair } from "@/app/entrar/acoes";
import { cn } from "@/lib/utils";
import { Marca } from "./Marca";
import { SeletorTema } from "./SeletorTema";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const ITENS = [
  { href: "/", rotulo: "Mesa", icone: LayoutDashboard },
  { href: "/clientes", rotulo: "Clientes", icone: Building2 },
  { href: "/financeiro", rotulo: "Financeiro", icone: Wallet },
  { href: "/metricas", rotulo: "Métricas", icone: BarChart3 },
  { href: "/guia", rotulo: "Guia da disputa", icone: BookOpen },
  { href: "/configuracoes", rotulo: "Configurações", icone: Settings },
];

interface Usuario {
  nome: string | null;
  email: string;
  papel: "admin" | "operador";
}

function ativo(caminho: string, href: string) {
  return href === "/" ? caminho === "/" : caminho === href || caminho.startsWith(`${href}/`);
}

function Conteudo({ usuario, aoNavegar }: { usuario: Usuario | null; aoNavegar?: () => void }) {
  const caminho = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/" onClick={aoNavegar} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <Marca sub="Mesa de operação" />
        </Link>
      </div>

      <nav aria-label="Seções" className="flex-1 space-y-0.5 px-2 py-3">
        {ITENS.map(({ href, rotulo, icone: Icone }) => {
          const atual = ativo(caminho, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={aoNavegar}
              aria-current={atual ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                atual
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icone className={cn("size-4", atual ? "text-sidebar-primary" : "text-sidebar-foreground/70")} />
              {rotulo}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-2">
        <SeletorTema className="w-full" />
        <MenuUsuario usuario={usuario} />
      </div>
    </div>
  );
}

function MenuUsuario({ usuario }: { usuario: Usuario | null }) {
  const nome = usuario?.nome || usuario?.email || "Equipe";
  const iniciais = nome
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
          {iniciais}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-medium text-sidebar-accent-foreground">{nome}</span>
          <span className="truncate text-xs text-sidebar-foreground">
            {usuario?.papel === "admin" ? "Administrador" : "Operador"}
          </span>
        </span>
        <ChevronsUpDown className="size-4 text-sidebar-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[--radix-dropdown-menu-trigger-width]">
        {usuario && (
          <>
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{usuario.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <form action={sair}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Menu lateral fixo em telas largas; no celular, barra no topo com gaveta. */
export function MenuLateral({ usuario }: { usuario: Usuario | null }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 print:!hidden border-r border-sidebar-border bg-sidebar lg:block">
        <Conteudo usuario={usuario} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 print:hidden items-center gap-2 border-b bg-background/85 px-3 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setAberto(true)}>
          <Menu />
        </Button>
        <Link href="/" className="min-w-0 flex-1">
          <Marca />
        </Link>
        <SeletorTema compacto />
      </header>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Conteudo usuario={usuario} aoNavegar={() => setAberto(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
