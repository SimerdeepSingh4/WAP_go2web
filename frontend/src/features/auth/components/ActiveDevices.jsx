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
    <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Active Devices ({activeCount} / {maxAllowed})
          </h2>
          <p className="text-xs text-muted-foreground">
            Max 3 devices allowed. If a 4th logs in, the oldest one is automatically logged out.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          Refresh Live
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading devices...</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session, index) => {
            const deviceNumber = sessions.length - index; 

            return (
              <div
                key={session.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                  session.isCurrentDevice
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`grid size-9 place-items-center rounded-full text-xs font-bold ${
                      session.isCurrentDevice
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    #{deviceNumber}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        Device {deviceNumber}
                      </span>
                      {session.isCurrentDevice && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          This Device
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-[280px] sm:max-w-md">
                      {session.userAgent || "Unknown Browser"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/80">
                      IP: {session.ip} • Logged in: {new Date(session.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-foreground font-medium">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </span>
                  {!session.isCurrentDevice && (
                    <button
                      onClick={() => logoutMutation.mutate(session.id)}
                      className="text-xs text-destructive hover:underline cursor-pointer"
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
