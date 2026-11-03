// src/features/user/pages/Settings.jsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserQuery, useUserMutation } from "../hooks/useUser";
import { PageHeading, QueryState } from "@/features/admin/components/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * Simple Settings page for regular users – allows updating username and email.
 * Uses the `updateProfile` mutation from `useUserMutation`.
 */
export default function UserSettings() {
  const { data, isLoading } = useUserQuery("accounts"); // fetch user profile (self)
  const { mutate: updateProfile, isPending: isUpdating } = useUserMutation("updateProfile", "Profile updated", null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value.trim();
    const email = form.email.value.trim();
    updateProfile({ username, email });
    toast.add({ title: "Saving...", type: "info" });
  };

  const user = data?.users?.[0] || {};

  return (
    <>
      <PageHeading title="Settings" description="Update your personal information." />
      <QueryState query={{ data, isLoading }}>
        <Card className="max-w-2xl mx-auto mt-6">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Username</label>
                <Input name="username" defaultValue={user.username} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
                <Input name="email" type="email" defaultValue={user.email} required />
              </div>
              <Button type="submit" disabled={isUpdating} className="w-full">
                {isUpdating ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </QueryState>
    </>
  );
}
