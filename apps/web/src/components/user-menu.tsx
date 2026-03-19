import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, User } from "lucide-react";
import { usePostHog } from "posthog-js/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

import { Button } from "./ui/button";

export default function UserMenu() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const { data: user } = useQuery(convexQuery(api.auth.getCurrentUser, {}));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <div className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="size-3" />
        </div>
        <span className="max-w-[120px] truncate">{user?.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/settings" />}>
            <Settings />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    posthog.reset();
                    navigate({ to: "/" });
                  },
                },
              });
            }}
          >
            <LogOut />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
