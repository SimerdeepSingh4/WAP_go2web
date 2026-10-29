import { useNavigate } from "react-router";
import { useAuthContext } from "../auth.context.jsx";

export const useAuth = () => {
    const navigate = useNavigate();
    const context = useAuthContext();

    const login = async (credentials, redirectPath = "/") => {
        const result = await context.login(credentials);
        navigate(redirectPath);
        return result;
    };

    const register = async (credentials, redirectPath = "/") => {
        const result = await context.register(credentials);
        navigate(redirectPath);
        return result;
    };

    const logout = async (redirectPath = "/login") => {
        await context.logout();
        navigate(redirectPath);
    };

    const logoutAll = async (redirectPath = "/login") => {
        await context.logoutAll();
        navigate(redirectPath);
    };

    return {
        ...context,
        login,
        register,
        logout,
        logoutAll,
    };
};

export default useAuth;
