import { api } from "@scrollect/backend/convex/_generated/api";
import { useAction } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const CONFIRMATION_TEXT = "DELETE";

export function DeleteAccountDialog() {
  const posthog = usePostHog();
  const deleteAccount = useAction(api.access.accountActions.deleteAccount);
  const [open, setOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = confirmationInput === CONFIRMATION_TEXT;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);

    try {
      await deleteAccount();
    } catch {
      toast.error("Failed to delete account. Please try again.");
      setIsDeleting(false);
      return;
    }

    posthog.reset();

    // Session is already deleted server-side; clear client state best-effort
    try {
      await authClient.signOut();
    } catch {
      // Expected - session no longer exists
    }

    // Hard redirect to clear all reactive subscriptions and client state
    window.location.href = "/";
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isDeleting) {
          setOpen(nextOpen);
          if (!nextOpen) setConfirmationInput("");
        }
      }}
    >
      <AlertDialogTrigger
        render={<Button variant="destructive" data-testid="delete-account-button" />}
      >
        <Trash2 data-icon="inline-start" />
        Delete my account
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete your account and all associated data - documents, learning
            posts, bookmarks, and tags. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-2">
          <label htmlFor="delete-confirmation" className="mb-2 block text-sm font-medium">
            Type <span className="font-mono font-bold">{CONFIRMATION_TEXT}</span> to confirm
          </label>
          <Input
            id="delete-confirmation"
            data-testid="delete-confirmation-input"
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
            placeholder={CONFIRMATION_TEXT}
            disabled={isDeleting}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting} data-testid="cancel-delete-account-button">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!isConfirmed || isDeleting}
            onClick={handleDelete}
            aria-busy={isDeleting}
            data-testid="confirm-delete-account-button"
          >
            {isDeleting && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {isDeleting ? "Deleting..." : "Delete my account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
