import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getSessions, logoutAll, logoutSession } from "../services/auth.api";

export default function ActiveDevices() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["activeSessions"],
    queryFn: getSessions,
    refetchInterval: 3000, 
  });
  const logoutMutation = useMutation({
    mutationFn: (sessionId) => logoutSession(sessionId),
    onSuccess: () => {
      refetch();
    },
  });

  const sessions = data?.sessions || [];
  const activeCount = data?.activeCount || 0;
  const maxAllowed = data?.maxAllowedDevices || 3;

  return (
    <div className="mt-6 rounded-xl border border-[#e7e4dc] bg-white p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1c1917]">
            Active Devices ({activeCount} / {maxAllowed})
          </h2>
          <p className="text-xs text-[#78716c]">
            Max 3 devices allowed. If a 4th logs in, the oldest one is automatically logged out.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs font-semibold text-[#ea580c] hover:underline cursor-pointer"
        >
          Refresh Live
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[#78716c]">Loading devices...</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session, index) => {
            const deviceNumber = sessions.length - index; 

            return (
              <div
                key={session.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                  session.isCurrentDevice
                    ? "border-[#ea580c] bg-[#fffaf5]"
                    : "border-[#e7e4dc] bg-[#faf8f5]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`grid size-9 place-items-center rounded-full text-xs font-bold ${
                      session.isCurrentDevice
                        ? "bg-[#ea580c] text-white"
                        : "bg-[#f4f1ea] text-[#78716c]"
                    }`}
                  >
                    #{deviceNumber}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1c1917]">
                        Device {deviceNumber}
                      </span>
                      {session.isCurrentDevice && (
                        <span className="rounded-full bg-[#ea580c] px-2 py-0.5 text-[10px] font-semibold text-white">
                          This Device
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#78716c] truncate max-w-[280px] sm:max-w-md">
                      {session.userAgent || "Unknown Browser"}
                    </p>
                    <p className="text-[10px] text-[#a8a29e]">
                      IP: {session.ip} • Logged in: {new Date(session.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#1c1917] font-medium">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </span>
                  {!session.isCurrentDevice && (
                    <button
                      onClick={() => logoutMutation.mutate(session.id)}
                      className="text-xs text-red-600 hover:underline cursor-pointer"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
