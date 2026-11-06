import { RouterProvider } from "react-router";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "./features/auth/auth.context";
import { SocketProvider } from "./features/socket/socket.context";
import { router } from "./app.routes";
import { Toaster } from "./components/ui/toast";

const App = () => {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: "easeInOut" }}>
      <AuthProvider>
        <Toaster>
          <SocketProvider>
            <RouterProvider router={router} />
          </SocketProvider>
        </Toaster>
      </AuthProvider>
    </MotionConfig>
  );
};

export default App;
