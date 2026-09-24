"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(expired ? "Sessão expirada. Entre novamente." : "");
  const [loading, setLoading] = useState(false);

  const errorId = "login-error";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setError(json?.error?.message || "Muitas tentativas. Tente novamente em instantes.");
        } else if (res.status === 401) {
          setError("Credenciais inválidas");
        } else {
          setError(json?.error?.message || "Não foi possível entrar. Tente novamente.");
        }
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível entrar. Verifique a conexão.");
    } finally {
      setLoading(false);
    }
  }

  const describedBy = useMemo(() => (error ? errorId : undefined), [error]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[var(--radius)] border border-border bg-card px-6 py-8 shadow-[var(--shadow-sm)]">
        <header className="text-center">
          <p className="font-wordmark text-3xl text-foreground">Juricon</p>
          <h1 className="mt-2 text-sm font-medium text-foreground">Portal jurídico interno</h1>
          <p className="mt-1 text-xs text-muted-foreground">Acesso restrito ao escritório</p>
        </header>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" aria-describedby={describedBy} noValidate>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
            />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-9"
                aria-invalid={Boolean(error)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={show}
              >
                {show ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={loading} type="submit" aria-busy={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Carregando…</div>}>
      <LoginForm />
    </Suspense>
  );
}
