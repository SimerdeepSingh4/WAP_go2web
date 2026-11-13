import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function useContactFolders(enabled = true) {
  const { user } = useAuth();
  const accountId = user?._id || user?.id;
  return useQuery({
    queryKey: ["contact-folders", accountId],
    enabled: enabled && user?.role === "Super Admin" && !user?.isPreview,
    queryFn: async ({ signal }) => {
      const response = await api.get("/groups", { signal, params: { owned: "true" } });
      return (response.data.data || []).filter((folder) => String(folder.userId?._id || folder.userId) === String(accountId));
    },
    staleTime: 10_000,
  });
}

export function useContactFolderPage(page, search, enabled = true) {
  const { user } = useAuth();
  const accountId = user?._id || user?.id;
  return useQuery({
    queryKey: ["contact-folders", accountId, "page", { page, search }],
    enabled: enabled && user?.role === "Super Admin" && !user?.isPreview,
    queryFn: async ({ signal }) => (await api.get("/groups", { signal, params: { owned: "true", page, limit: 12, search } })).data,
    staleTime: 10_000,
  });
}

export function useContactFolderDetail(id) {
  const { user } = useAuth();
  const accountId = user?._id || user?.id;
  return useQuery({
    queryKey: ["contact-folders", accountId, "detail", id],
    enabled: Boolean(id) && user?.role === "Super Admin" && !user?.isPreview,
    queryFn: async ({ signal }) => (await api.get(`/groups/${id}`, { signal })).data.data,
    staleTime: 10_000,
  });
}
