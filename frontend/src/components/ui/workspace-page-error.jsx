import { useEffect } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

const moduleLoadFailure = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

export default function WorkspacePageError({ title, reloadLabel = "Reload page" }) {
  const error = useRouteError();

  useEffect(() => {
    if (!import.meta.env.DEV || !moduleLoadFailure.test(error?.message || "")) return;
    const key = `workspace-module-retry:${window.location.pathname}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <div className="p-4 sm:p-6">
      <Empty className="min-h-64 border border-solid bg-card">
        <EmptyHeader role="alert">
          <EmptyMedia variant="icon"><CircleAlert aria-hidden="true" /></EmptyMedia>
          <h1 className="text-xl font-semibold">{title}</h1>
          <EmptyDescription>Reload this page to try again.</EmptyDescription>
        </EmptyHeader>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" readOnlySafe onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden="true" /> {reloadLabel}
          </Button>
          <Button nativeButton={false} readOnlySafe variant="outline" render={<Link to=".." />}>
            Back to dashboard
          </Button>
        </div>
      </Empty>
    </div>
  );
}
