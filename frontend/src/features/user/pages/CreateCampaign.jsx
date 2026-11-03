// src/features/user/pages/CreateCampaign.jsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/features/admin/components/shared";
import { useUserMutation } from "../hooks/useUser";
import { toast } from "@/components/ui/toast";

/**
 * Front‑end only form for creating a new campaign.
 * It collects five key pieces of information and submits them
 * via the `createCampaign` mutation defined in `useUser`.
 */
export default function CreateCampaign() {
  const [form, setForm] = useState({
    title: "",
    category: "Marketing",
    budget: "",
    startDate: "",
    endDate: "",
    description: "",
  });

  const { mutate: createCampaign, isLoading } = useUserMutation(
    "createCampaign",
    "Campaign created successfully",
    null
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Basic front‑end validation
    const { title, budget, startDate, endDate } = form;
    if (!title || !budget || !startDate || !endDate) {
      toast.add({ title: "All required fields must be filled", type: "error" });
      return;
    }
    createCampaign(form);
  };

  return (
    <>
      <PageHeading
        title="Create Campaign"
        description="Define a new marketing campaign. Only front‑end validation is applied."
      />
      <Card className="max-w-2xl mx-auto mt-8">
        <CardHeader>
          <CardTitle>New Campaign Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <Input name="title" value={form.title} onChange={handleChange} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 p-2 focus:outline-none"
              >
                <option value="Marketing">Marketing</option>
                <option value="Social Media">Social Media</option>
                <option value="Fundraising">Fundraising</option>
                <option value="Product Launch">Product Launch</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Budget ($) *</label>
              <Input
                type="number"
                name="budget"
                value={form.budget}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <Input type="date" name="startDate" value={form.startDate} onChange={handleChange} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date *</label>
                <Input type="date" name="endDate" value={form.endDate} onChange={handleChange} required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea name="description" value={form.description} onChange={handleChange} rows={4} />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Creating…" : "Create Campaign"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
