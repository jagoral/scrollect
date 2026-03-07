"use client";

import { Authenticated } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

function AuthenticatedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/library");
  }, [router]);
  return null;
}

export default function SignInPage() {
  const [showSignIn, setShowSignIn] = useState(true);

  return (
    <div className="flex flex-1 flex-col">
      <Authenticated>
        <AuthenticatedRedirect />
      </Authenticated>
      {showSignIn ? (
        <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
      ) : (
        <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
      )}
    </div>
  );
}
