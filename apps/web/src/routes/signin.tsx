import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [{ title: "Sign In | Scrollect" }],
  }),
  beforeLoad: async ({ context }) => {
    if (context.initialToken) {
      throw redirect({ to: "/library" });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const [showSignIn, setShowSignIn] = useState(true);

  return (
    <div className="flex flex-1 flex-col">
      {showSignIn ? (
        <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
      ) : (
        <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
      )}
    </div>
  );
}
