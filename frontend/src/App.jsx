import { RouterProvider } from "react-router"
import { AuthProvider } from "./features/auth/auth.context"
import { router } from "./app.routes"
import { Toaster } from "./components/ui/toast"

const App = () => {
  return (
    <AuthProvider>

        <Toaster>
          <RouterProvider router={router} />
        </Toaster>

    </AuthProvider>
  )
}

export default App
