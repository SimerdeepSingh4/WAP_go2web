import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getSessions, logoutAll } from "../services/auth.api";

export default function ActiveDevices() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["activeSessions"],
    queryFn: getSessions,
    refetchInterval: 3000, 
  });

  const sessions = data?.sessions || [];
  const activeCount = data?.activeCount || 0;
  const maxAllowed = data?.maxAllowedDevices || 3;

  return (
    <div className="mt-6 rounded-xl border border-[#dde3d5] bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#334331]">
            Active Devices ({activeCount} / {maxAllowed})
          </h2>
          <p className="text-xs text-[#68765a]">
            Max 3 devices allowed. If a 4th logs in, the oldest one is automatically logged out.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-[#315e48] hover:underline cursor-pointer"
        >
          Refresh Live
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[#737d6b]">Loading devices...</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session, index) => {
            // Label them Device 1, Device 2, Device 3 in order of oldest to newest
            const deviceNumber = sessions.length - index; 

            return (
              <div
                key={session.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                  session.isCurrentDevice
                    ? "border-[#315e48] bg-[#f1f6ed]"
                    : "border-[#e0e5d6] bg-[#fafbf8]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`grid size-9 place-items-center rounded-full text-xs font-bold ${
                      session.isCurrentDevice
                        ? "bg-[#315e48] text-white"
                        : "bg-[#e5ebd9] text-[#4d5c43]"
                    }`}
                  >
                    #{deviceNumber}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#2d3a2b]">
                        Device {deviceNumber}
                      </span>
                      {session.isCurrentDevice && (
                        <span className="rounded-full bg-[#315e48] px-2 py-0.5 text-[10px] font-semibold text-white">
                          This Device
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6e7d64] truncate max-w-[280px] sm:max-w-md">
                      {session.userAgent || "Unknown Browser"}
                    </p>
                    <p className="text-[10px] text-[#8e9c85]">
                      IP: {session.ip} • Logged in: {new Date(session.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 text-xs text-[#315e48] font-medium">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}