import { RouterProvider } from "react-router";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "./features/branding/ThemeProvider";
import { AuthProvider } from "./features/auth/auth.context";
import { BrandingProvider } from "./features/branding/BrandingContext";
import { SocketProvider } from "./features/socket/socket.context";
import { router } from "./app.routes";
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
