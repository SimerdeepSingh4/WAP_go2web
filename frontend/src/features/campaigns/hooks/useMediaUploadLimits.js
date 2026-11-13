import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "@/components/ui/toast";
import { getMediaUploadLimits, saveMediaUploadLimits } from "../services/mediaUploadLimits.api.js";
import { DEFAULT_MEDIA_UPLOAD_LIMITS } from "../../../../../shared/mediaUploadLimits.js";

export default function useMediaUploadLimits() {
    const { user } = useAuth();
    const query = useQuery({
        queryKey: ["media-upload-limits", user?.id || user?._id],
        queryFn: ({ signal }) => getMediaUploadLimits(signal),
        enabled: Boolean(user),
        staleTime: 0,
    });
    return { ...query, defaults: query.data?.defaults || DEFAULT_MEDIA_UPLOAD_LIMITS, effective: query.data?.effective || DEFAULT_MEDIA_UPLOAD_LIMITS };
}

export function useSaveMediaUploadLimits({ accountId, onSuccess } = {}) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: values => saveMediaUploadLimits(values, accountId),
        onSuccess: async data => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ["media-upload-limits"] }),
                client.invalidateQueries({ queryKey: ["admin"] }),
            ]);
            toast.add({ title: accountId ? "Account upload limits saved" : "Campaign upload limits saved", type: "success" });
            onSuccess?.(data);
        },
        onError: error => toast.add({ title: "Could not save upload limits", description: error.response?.data?.message || error.message, type: "error" }),
    });
}
