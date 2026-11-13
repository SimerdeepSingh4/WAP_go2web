import { RouterProvider } from "react-router";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "./features/branding/context/ThemeProvider";
import { AuthProvider } from "./features/auth/context/auth.context.jsx";
import { BrandingProvider } from "./features/branding/context/BrandingContext";
import { SocketProvider } from "./features/socket/context/socket.context.jsx";
import { router } from "./app.routes.jsx";
import { Toaster } from "./components/ui/toast";

const App = () => {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: "easeInOut" }}>
        <AuthProvider>
          <BrandingProvider>
            <Toaster>
              <SocketProvider>
                <RouterProvider router={router} />
              </SocketProvider>
            </Toaster>
          </BrandingProvider>
        </AuthProvider>
      </MotionConfig>
    </ThemeProvider>
  );
};

export default App;
