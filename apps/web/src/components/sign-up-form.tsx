import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const posthog = usePostHog();
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            posthog.capture("user.signed_up");
            window.location.href = "/app/library";
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-logo text-3xl font-semibold leading-[1.05] tracking-[-0.015em] sm:text-[2.25rem]">
          Create account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start your learning feed in under a minute.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="name">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Name</Label>
              <Input
                id={field.name}
                name={field.name}
                placeholder="Your name"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-sm text-destructive">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <form.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Email</Label>
              <Input
                id={field.name}
                name={field.name}
                type="email"
                placeholder="you@example.com"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-sm text-destructive">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Password</Label>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                placeholder="At least 8 characters"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-sm text-destructive">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              size="lg"
              className="mt-2 w-full border border-primary bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Creating account..." : "Create account"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <p className="mt-5 text-xs text-muted-foreground">
        By creating an account, you agree to our{" "}
        <Link
          to="/terms-and-conditions"
          target="_blank"
          className="underline underline-offset-4 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          Terms & Conditions
        </Link>{" "}
        and{" "}
        <Link
          to="/privacy-policy"
          target="_blank"
          className="underline underline-offset-4 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          Privacy Policy
        </Link>
        .
      </p>

      <div className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <button
          onClick={onSwitchToSignIn}
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
