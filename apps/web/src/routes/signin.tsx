import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { AuthEditorialPanel } from "@/components/auth/auth-editorial-panel";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

type AuthMode = "signin" | "signup";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [{ title: "Sign In | Scrollect" }],
    links: [{ rel: "canonical", href: "https://scrollect.app/signin" }],
  }),
  beforeLoad: async ({ context }) => {
    if (context.initialToken) {
      throw redirect({ to: "/app/library" });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const [mode, setMode] = useState<AuthMode>("signin");

  return (
    <div className="grid flex-1 grid-cols-1 md:grid-cols-[1.1fr_1fr]">
      <AuthEditorialPanel mode={mode} />
      <div className="flex items-center justify-center px-5 py-12 sm:px-8 md:py-16 md:pl-12 md:pr-[max(2rem,calc((100vw-64rem)/2))] lg:pl-16">
        <div
          key={mode}
          className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          {mode === "signin" ? (
            <SignInForm onSwitchToSignUp={() => setMode("signup")} />
          ) : (
            <SignUpForm onSwitchToSignIn={() => setMode("signin")} />
          )}
        </div>
      </div>
    </div>
  );
}
