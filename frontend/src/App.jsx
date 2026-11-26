import { RouterProvider } from "react-router";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "./features/branding/context/ThemeProvider.jsx";
import { AuthProvider } from "./features/auth/context/auth.context.jsx";
import { BrandingProvider } from "./features/branding/context/BrandingContext.jsx";
import { SocketProvider } from "./features/socket/context/socket.context.jsx";
import { router } from "./app.routes.jsx";
import { Toaster } from "./components/ui/toast";
import { Suspense, useEffect } from "react";
import { useAuthContext } from "./features/auth/context/auth.context.jsx";

function SessionRouter() {
  const { workspaceGeneration } = useAuthContext();
  useEffect(() => {
    if (workspaceGeneration) void router.navigate("/", { replace: true });
  }, [workspaceGeneration]);
  return <RouterProvider router={router} />;
}

const App = () => {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: "easeInOut" }}>
        <AuthProvider>
          <BrandingProvider>
            <Toaster>
              <SocketProvider>
                <Suspense fallback={<div className="min-h-screen bg-background" />}>
                  <SessionRouter />
                </Suspense>
              </SocketProvider>
            </Toaster>
          </BrandingProvider>
        </AuthProvider>
      </MotionConfig>
    </ThemeProvider>
  );
};

export default App;
