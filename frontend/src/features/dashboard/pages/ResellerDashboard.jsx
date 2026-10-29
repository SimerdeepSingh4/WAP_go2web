import React, { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/hooks/useAuth.js";
import { fetchUsers, createClientUser, accessUserAccount } from "../services/users.api.js";

export default function ResellerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Fetch client users under this reseller (or all users if Super Admin)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["clientUsers"],
    queryFn: () => fetchUsers(),
  });

  const users = data?.users || [];

  // Mutation to create a new client user
  const createMutation = useMutation({
    mutationFn: createClientUser,
    onSuccess: () => {
      setSuccessMsg("Client user created successfully!");
      setErrorMsg("");
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      setShowCreateModal(false);
      queryClient.invalidateQueries({ queryKey: ["clientUsers"] });
    },
    onError: (err) => {
      setErrorMsg(err.message || "Failed to create user");
    },
  });

  // Mutation to access / switch into user account
  const accessMutation = useMutation({
    mutationFn: accessUserAccount,
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      queryClient.setQueryData(["authUser"], data.user);
      queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
      navigate("/");
    },
    onError: (err) => {
      alert(`Could not access user account: ${err.message}`);
    },
  });

  const handleCreateUser = (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    createMutation.mutate({
      username: newUsername.trim(),
      email: newEmail.trim(),
      password: newPassword,
    });
  };

  return (
    <div className="min-h-screen bg-[#fafbf8] p-6 sm:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header banner */}
        <div className="bg-white rounded-xl border border-[#dde3d5] p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                {user?.role} Portal
              </span>
              <span className="text-xs text-[#6e7d64]">Management Console</span>
            </div>
            <h1 className="text-2xl font-bold text-[#2d3a29]">Client User Accounts</h1>
            <p className="text-xs text-[#6e7d64]">
              {user?.role === "Super Admin"
                ? "Manage and access all client user accounts across the platform."
                : "Manage and access user accounts assigned under your reseller balance."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="px-3.5 py-2 text-xs font-medium text-[#4b5a43] border border-[#cfd6c7] rounded-lg hover:bg-[#f5f7f2] transition-colors"
            >
              ← My Dashboard
            </Link>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#284f3a] rounded-lg hover:bg-[#1e3e2d] transition-colors cursor-pointer shadow-xs"
            >
              + Create Client User
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
            {successMsg}
          </div>
        )}

        {/* Modal for creating a user */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-[#dde3d5] max-w-md w-full p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#2d3a29]">Add New Client User</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs text-[#718067] hover:text-black cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>

              {errorMsg && (
                <div className="mb-4 p-2.5 text-xs bg-[#fcf0ed] border border-[#eed5cf] text-[#a13d35] rounded-md">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#3b4736] mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. client_agency"
                    className="w-full px-3 py-2 text-sm border border-[#cfd6c7] rounded-lg outline-none focus:border-[#284f3a]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3b4736] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="client@example.com"
                    className="w-full px-3 py-2 text-sm border border-[#cfd6c7] rounded-lg outline-none focus:border-[#284f3a]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3b4736] mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm border border-[#cfd6c7] rounded-lg outline-none focus:border-[#284f3a]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-2 text-xs text-[#526348] hover:underline"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#284f3a] rounded-lg hover:bg-[#1e3e2d] disabled:opacity-50"
                  >
                    {createMutation.isPending ? "Creating..." : "Save Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Users list table */}
        <div className="bg-white rounded-xl border border-[#dde3d5] p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#2d3a29]">
              Assigned Accounts ({users.length})
            </h2>
            <button
              onClick={() => refetch()}
              className="text-xs text-[#284f3a] hover:underline cursor-pointer"
            >
              Refresh List
            </button>
          </div>

          {isLoading ? (
            <p className="text-xs text-[#6e7d64]">Loading user accounts...</p>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#718067]">
              No client users found under your account. Click "+ Create Client User" to add one.
            </div>
          ) : (
            <div className="divide-y divide-[#edf1e8]">
              {users.map((client) => (
                <div
                  key={client._id}
                  className="py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#fafbf8] px-2 rounded-lg transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#273323]">
                        {client.username}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {client.role}
                      </span>
                      <span className="text-[10px] text-[#78876e]">
                        Status: {client.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#606f56]">{client.email}</p>
                    <p className="text-[10px] text-[#85957b]">
                      Created: {new Date(client.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Access user account button */}
                    <button
                      onClick={() => accessMutation.mutate(client._id)}
                      disabled={accessMutation.isPending}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#315e48] hover:bg-[#254b38] rounded-md transition-all cursor-pointer shadow-xs disabled:opacity-50"
                      title="Switch into this user account to view their campaigns and messages"
                    >
                      {accessMutation.isPending ? "Switching..." : "Access User Account →"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

