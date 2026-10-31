import { RouterProvider } from "react-router";
import { AuthProvider } from "./features/auth/auth.context";
import { SocketProvider } from "./features/socket/socket.context";
import { router } from "./app.routes";
import { Toaster } from "./components/ui/toast";

const App = () => {
  return (
    <AuthProvider>
      <Toaster>
        <SocketProvider>
          <RouterProvider router={router} />
        </SocketProvider>
      </Toaster>
    </AuthProvider>
  );
};

export default App;
